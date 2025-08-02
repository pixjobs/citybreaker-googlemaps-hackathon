export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import {
  EnrichedPlace,
  ItineraryDayCache,
  PdfJob,
  createPdfJob,
  updatePdfJob,
  getPdfJob,
  getManyPlaceEnrichments,
  isPlaceFresh,
  upsertPlaceEnrichment,
  placeKeyFromName,
} from '@/lib/firestoreCache';

/* ============================================================================
 * CONFIGURATION
 * ============================================================================ */

const GEMINI_SECRET = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET   = 'projects/934477100130/secrets/places-api-key/versions/latest';
const BUCKET_NAME   = 'citybreaker-downloads';
const GEMINI_MODEL  = 'gemini-2.5-flash-lite';
const MAX_AI_RETRIES = 3;

const SOURCE_IMAGE_WIDTH = 1200;
const COVER_IMAGE_WIDTH = 1000;
const ACTIVITY_IMAGE_WIDTH = 500;

const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_PHOTO_BASE_URL  = 'https://places.googleapis.com/v1';

/* ============================================================================
 * TYPE DEFINITIONS
 * ============================================================================ */

type ItineraryDay = ItineraryDayCache;

interface CityGuide {
  tagline: string;
  coverPhotoSuggestion: string;
  airportTransport: { title: string; content: string };
  publicTransport: { title: string; content: string };
  proTips: { title: string; content: string };
}

interface DreamerRec {
  name: string;
  area?: string;
  url: string;
  note?: string;
}

/* ============================================================================
 * CLIENTS
 * ============================================================================ */

const storage = new Storage();
const smClient = new SecretManagerServiceClient();

let geminiKey: string | null = null;
let mapsKey: string | null = null;

/* ============================================================================
 * CORE HELPERS & GENERATION LOGIC
 * ============================================================================ */

function parseLlmJson<T>(rawText: string): T {
  console.log("Raw LLM Response Text for parsing:", rawText);
  const match = rawText.match(/{[\s\S]*}/);
  if (!match) throw new SyntaxError("No valid JSON object found in the LLM response.");
  const jsonString = match[0];
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error("Failed to parse the following cleaned JSON string:", jsonString);
    throw error;
  }
}

async function getSecret(name: string): Promise<string> {
  try {
    const [version] = await smClient.accessSecretVersion({ name });
    const secretValue = version.payload?.data?.toString();
    if (!secretValue) throw new Error(`Secret ${name} is empty or could not be retrieved.`);
    return secretValue;
  } catch (error) {
    console.error(`Failed to retrieve secret: ${name}`, error);
    throw new Error(`Could not access secret: ${name}`);
  }
}

function createFilename(city: string, days: number): string {
  const safeCity = city.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${safeCity}_${days}d_Guide.pdf`;
}

async function enrichPlaces(
  placeNames: { name: string }[],
  apiKey: string,
  city: string
): Promise<EnrichedPlace[]> {
  const names = placeNames.map(p => p.name);
  const cachedData = await getManyPlaceEnrichments(names);
  const enrichedPlaces: EnrichedPlace[] = [];
  const placesToFetch: string[] = [];
  for (const name of names) {
    const key = placeKeyFromName(name);
    const cacheEntry = cachedData.get(key);
    if (cacheEntry && isPlaceFresh(cacheEntry)) {
      enrichedPlaces.push(cacheEntry.place);
    } else {
      placesToFetch.push(name);
    }
  }
  const newlyFetchedPlaces = await Promise.all(
    placesToFetch.map(async (name) => {
      const originalName = name?.trim();
      if (!originalName) return null;
      try {
        const searchQuery = `${originalName} in ${city}`;
        const res = await fetch(PLACES_SEARCH_TEXT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.photos' },
          body: JSON.stringify({ textQuery: searchQuery }),
        });
        if (!res.ok) throw new Error(`Places API error: ${res.status}`);
        const data = await res.json();
        const place = data.places?.[0];
        if (!place) return { name: originalName };
        const photoName = place.photos?.[0]?.name;
        const photoUrl = photoName ? `${PLACES_PHOTO_BASE_URL}/${photoName}/media?key=${apiKey}&maxWidthPx=${SOURCE_IMAGE_WIDTH}` : undefined;
        const enriched: EnrichedPlace = {
          name: place.displayName?.text || originalName,
          photoUrl,
          website: place.websiteUri,
          googleMapsUrl: place.googleMapsUri,
          placeId: place.id,
        };
        await upsertPlaceEnrichment(originalName, enriched);
        return enriched;
      } catch (error) {
        console.error(`Failed to enrich place: ${originalName}`, error);
        return { name: originalName };
      }
    })
  );
  return [...enrichedPlaces, ...newlyFetchedPlaces.filter((p): p is EnrichedPlace => p !== null)];
}

async function processImages(
  enrichedPlaces: EnrichedPlace[],
  coverPhotoSuggestion: string
): Promise<Map<string, string>> {
  // 1. Create an array of promises. Each promise will resolve to a [key, value] pair or null on failure.
  const imagePromises = enrichedPlaces
    .filter(place => place.photoUrl)
    .map(async (place): Promise<[string, string] | null> => {
      try {
        const response = await fetch(place.photoUrl!);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        
        const isCover = place.name === coverPhotoSuggestion;
        const targetWidth = isCover ? COVER_IMAGE_WIDTH : ACTIVITY_IMAGE_WIDTH;
        const quality = isCover ? 80 : 75;

        const compressedBuffer = await sharp(Buffer.from(buffer))
          .resize({ width: targetWidth })
          .webp({ quality })
          .toBuffer();
          
        const base64 = `data:image/webp;base64,${compressedBuffer.toString('base64')}`;
        
        // 2. Return the successful result as a tuple [key, value]. Do not mutate an external map.
        return [place.name, base64];

      } catch (error) {
        console.error(`Failed to process image for ${place.name}:`, error);
        // 3. Return null for any image that fails to process.
        return null;
      }
    });

  // 4. Wait for all image processing operations to complete.
  const results = await Promise.all(imagePromises);

  // 5. Filter out any null results from failed operations and construct the final Map in one step.
  // This is a safe, non-mutating, and predictable way to build the map.
  const successfulPairs = results.filter((result): result is [string, string] => result !== null);
  
  return new Map(successfulPairs);
}

async function generateItineraryJson(
  places: EnrichedPlace[],
  days: number,
  city: string
): Promise<ItineraryDay[]> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const placeList = places.map((p) => `"${p.name}"`).join(', ');
      const prompt = `You are a travel guide API. Your only output is a single, valid JSON object. Do not include any other text, markdown, or commentary. For a ${days}-day trip to ${city}, create a JSON object with a root key "itinerary". The "itinerary" is an array where each day has a "title" and an "activities" array. Each activity must have: "title", "placeName" (from [${placeList}]), "priceRange" (Free/$/$$/$$$), "audience", "description" (~22-28 words), "whyVisit" (<=10 words), and "insiderTip" (<=10 words).`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLlmJson<{ itinerary?: ItineraryDay[] }>(text);
      if (!Array.isArray(parsed.itinerary)) throw new Error('Malformed response: "itinerary" key is not an array.');
      return parsed.itinerary;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed for generateItineraryJson. Retrying...`, error);
      if (i === MAX_AI_RETRIES - 1) throw error;
    }
  }
  throw new Error('Failed to generate itinerary after multiple retries.');
}

async function generateCityGuideJson(city: string, places: EnrichedPlace[]): Promise<CityGuide> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const placeNames = places.map((p) => p.name).join(', ');
      const prompt = `You are a travel guide API. Your only output is a single, valid JSON object. Do not include any other text, markdown, or commentary. For ${city}, produce a JSON object with a root key "guide". The "guide" object must have: "tagline", "coverPhotoSuggestion" (ONE from [${placeNames}]), "airportTransport":{title,content(55-70 words)}, "publicTransport":{title,content(55-70 words)}, and "proTips":{title,content(55-70 words)}.`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLlmJson<{ guide?: CityGuide }>(text);
      if (!parsed.guide) throw new Error('Malformed response: "guide" key not found.');
      return parsed.guide;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed for generateCityGuideJson. Retrying...`, error);
      if (i === MAX_AI_RETRIES - 1) throw error;
    }
  }
  throw new Error('Failed to generate city guide after multiple retries.');
}

async function generateDreamersJson(city: string): Promise<DreamerRec[]> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const prompt = `You are a career advisor API. Your only output is a single, valid JSON object. Do not include any other text, markdown, or commentary. For ${city}, identify 2-4 universities or tech hubs for engineers/entrepreneurs. Produce a JSON object with a root key "dreamers". Each item in the "dreamers" array must have: "name", "area" (neighborhood), "url", and "note" (a one-sentence summary of its relevance to tech/innovation).`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLlmJson<{ dreamers?: DreamerRec[] }>(text);
      if (!Array.isArray(parsed.dreamers)) throw new Error('Malformed response: "dreamers" key is not an array.');
      return parsed.dreamers;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed for generateDreamersJson. Retrying...`, error);
      if (i === MAX_AI_RETRIES - 1) throw error;
    }
  }
  throw new Error('Failed to generate dreamers list after multiple retries.');
}

async function getLogoBase64(): Promise<string> {
  let logoBase64Cache: string | null = null;
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');
    const buf = await fsp.readFile(logoPath);
    logoBase64Cache = `data:image/png;base64,${buf.toString('base64')}`;
    return logoBase64Cache;
  } catch {
    console.error('Could not read logo file. It will be omitted from the PDF.');
    return '';
  }
}

async function buildHtml(
  guide: CityGuide,
  itinerary: ItineraryDay[],
  enriched: EnrichedPlace[],
  city: string,
  dreamers: DreamerRec[],
  compressedImages: Map<string, string>
): Promise<string> {
  const logoBase64 = await getLogoBase64();
  const coverPlace = enriched.find((p) => p.name === guide.coverPhotoSuggestion);
  
  let coverPhotoUrl = '';
  if (coverPlace) {
    coverPhotoUrl = compressedImages.get(coverPlace.name) || '';
  }
  
  // CORRECTED: This logic is now fully type-safe.
  if (!coverPhotoUrl && compressedImages.size > 0) {
    // Get the first value from the iterator, which could be undefined if the map is empty.
    const fallbackValue = compressedImages.values().next().value;
    // Ensure we assign a string by providing a final fallback to ''.
    coverPhotoUrl = fallbackValue || '';
  }

  const coverPageHtml = `<section class="page cover-page" style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.78) 100%), url('${coverPhotoUrl}');"><div class="cover-content">${logoBase64 ? `<img src="${logoBase64}" class="cover-logo" alt="Logo" />` : ''}<h1 class="cover-title">${city}</h1><p class="cover-tagline">${guide.tagline}</p></div><div class="cover-guide-container"><div class="guide-col"><h3>${guide.airportTransport.title}</h3><p>${guide.airportTransport.content}</p></div><div class="guide-col"><h3>${guide.publicTransport.title}</h3><p>${guide.publicTransport.content}</p></div><div class="guide-col"><h3>${guide.proTips.title}</h3><p>${guide.proTips.content}</p></div></div></section>`;
  
  let itineraryHtml = '';
  let pageCounter = 2;
  itinerary.forEach((day, dayIndex) => {
    const activities = day.activities || [];
    for (let i = 0; i < activities.length; i += 2) {
      const chunk = activities.slice(i, i + 2);
      const activitiesHtml = chunk.map((activity) => {
          const place = enriched.find((p) => p.name === activity.placeName);
          const imageSrc = place ? compressedImages.get(place.name) : null;
          const links = [
            place?.website ? `<a href="${place.website}" target="_blank">Official</a>` : '',
            place?.googleMapsUrl ? `<a href="${place.googleMapsUrl}" target="_blank">Maps</a>` : '',
            `<a href="https://www.tripadvisor.com/Search?q=${encodeURIComponent(activity.placeName || '')}" target="_blank">TripAdvisor</a>`
          ].filter(Boolean).join(' ');
          
          return `<article class="activity"><div class="image">${imageSrc ? `<img src="${imageSrc}" alt="${activity.title || ''}" />` : '<div class="no-image"></div>'}</div><div class="content"><div class="meta"><span class="pill">${activity.priceRange}</span><span class="pill">${activity.audience}</span></div><h3>${activity.title}</h3><p class="desc">${activity.description}</p><div class="kv"><div><label>Why</label><p>${activity.whyVisit}</p></div><div><label>Tip</label><p>${activity.insiderTip}</p></div></div><div class="links">${links}</div></div></article>`;
        }).join('');
        
      itineraryHtml += `<section class="page it-page"><header class="head">${logoBase64 ? `<img src="${logoBase64}" class="logo-small" alt="Logo" />` : ''}<div class="head-text"><h1>${city}</h1><span>Curated Itinerary</span></div></header>${i === 0 ? `<div class="day-title"><h2>Day ${dayIndex + 1}</h2><h1>${day.title}</h1></div>` : '<div class="day-title placeholder"></div>'}<div class="acts">${activitiesHtml}</div><footer class="foot"><p>CityBreaker</p><p>${pageCounter}</p></footer></section>`;
      pageCounter++;
    }
  });

  let dreamersPage = '';
  if (dreamers.length > 0) {
    const dreamersHtml = dreamers.map((d) => `<div class="dre-card"><h3>${d.name}${d.area ? ` · <span class="area">${d.area}</span>` : ''}</h3>${d.note ? `<p class="dre-note">${d.note}</p>` : ''}<p class="dre-link"><a href="${d.url}" target="_blank">${d.url.replace(/^https?:\/\//, '')}</a></p></div>`).join('');
    dreamersPage = `<section class="page dre-page"><header class="dre-head">${logoBase64 ? `<img src="${logoBase64}" class="logo-small" alt="Logo" />` : ''}<div class="dre-title"><h1>Dreamers / Engineers</h1><span>Universities & ecosystems to explore</span></div></header><div class="dre-grid">${dreamersHtml}</div><footer class="foot"><p>CityBreaker</p><p>${pageCounter}</p></footer></section>`;
  }

  const styles = `<style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');:root{--serif:'Playfair Display',serif;--sans:'Inter',system-ui,sans-serif;--brand:#E6C670;--bg:#181818;--text:#EAEAEA;--muted:#A0A0A0;--card:#232323;--line:#3a3a3a}html,body{margin:0;padding:0;background:#000}body{font-family:var(--sans);color:var(--text);-webkit-print-color-adjust:exact}.page{width:210mm;height:297mm;box-sizing:border-box;page-break-after:always;position:relative;display:flex;flex-direction:column;overflow:hidden;background:var(--bg)}.page:last-child{page-break-after:auto}a{color:var(--brand);text-decoration:none}.cover-page{background-size:cover;background-position:center;justify-content:space-between;color:#fff}.cover-content{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18mm 14mm 6mm;text-align:center}.cover-logo{width:120px;height:120px;margin-bottom:16px;filter:invert(1) brightness(1.2)}.cover-title{font-family:var(--serif);font-size:64px;letter-spacing:.5px;margin:0;text-shadow:2px 2px 10px rgba(0,0,0,.6)}.cover-tagline{font-size:15px;letter-spacing:2px;text-transform:uppercase;margin:8px 0 0;color:#f0f0f0;opacity:.95}.cover-guide-container{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:14mm;margin:6mm 10mm 16mm;background:rgba(24,24,24,.88);border:1px solid rgba(255,255,255,.12);border-radius:10px}.guide-col h3{font-family:var(--serif);color:var(--brand);font-size:16px;margin:0 0 6px}.guide-col p{font-size:12.5px;line-height:1.55;margin:0;color:var(--text)}.it-page{padding:12mm}.head{display:flex;align-items:center;border-bottom:1px solid var(--line);padding-bottom:8px}.logo-small{width:44px;height:44px;margin-right:12px;filter:invert(1) brightness(1.2)}.head-text h1{font-family:var(--serif);font-size:26px;margin:0}.head-text span{font-size:12px;color:var(--muted)}.day-title{text-align:center;margin:10mm 0 7mm}.day-title h2{font-size:13px;color:var(--brand);letter-spacing:2px;margin:0;text-transform:uppercase}.day-title h1{font-family:var(--serif);font-size:28px;margin:4px 0 0}.day-title.placeholder{min-height:52px;margin:10mm 0 7mm}.acts{display:flex;flex-direction:column;gap:8mm}.activity{display:flex;gap:8mm;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}.image{width:38%;min-height:72mm;background:#2b2b2b}.image img{width:100%;height:100%;object-fit:cover;display:block}.no-image{width:100%;height:100%;background:#2f2f2f}.content{flex:1;padding:10mm 10mm 9mm 0;display:flex;flex-direction:column}.meta{display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap}.pill{font-size:11px;color:#111;background:var(--brand);padding:4px 8px;border-radius:100px;font-weight:600}.content h3{font-family:var(--serif);font-size:18px;margin:2px 0 6px}.desc{font-size:12.5px;line-height:1.55;margin:0 0 8px;color:var(--text)}.kv{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:4px 0 8px}.kv label{display:block;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px}.kv p{font-size:12.5px;line-height:1.5;margin:0}.links a{margin-right:10px}.foot{position:absolute;bottom:8mm;left:12mm;right:12mm;display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}.dre-page{padding:14mm}.dre-head{display:flex;align-items:center;border-bottom:1px solid var(--line);padding-bottom:8px}.dre-title h1{font-family:var(--serif);font-size:26px;margin:0}.dre-title span{font-size:12px;color:var(--muted)}.dre-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:10mm}.dre-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8mm}.dre-card h3{font-family:var(--serif);font-size:18px;margin:0 0 4px}.dre-card .area{font-weight:600;color:var(--brand);font-size:14px}.dre-note{font-size:12.5px;line-height:1.55;color:var(--text);margin:4px 0 8px}.dre-link a{font-size:12.5px;word-break:break-word}@media screen and (max-width:900px){.page{width:100vw;height:auto;min-height:100vh}.cover-guide-container{grid-template-columns:1fr}.activity{flex-direction:column}.image{width:100%;min-height:48vw}.content{padding:10mm}.dre-grid{grid-template-columns:1fr}}</style>`;
  
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${city} – CityBreaker Guide</title>${styles}</head><body>${coverPageHtml}${itineraryHtml}${dreamersPage}</body></html>`;
}

async function getExecutablePath(): Promise<string> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    const puppeteer = await import('puppeteer');
    return puppeteer.executablePath();
  } catch (error) {
    console.error("Could not dynamically import 'puppeteer'.", error);
    throw new Error("For local development, you must install the full 'puppeteer' package as a dev dependency (`npm install -D puppeteer`).");
  }
}

async function generatePdf(html: string): Promise<Buffer> {
  let browser = null;
  try {
    const executablePath = await getExecutablePath();
    browser = await puppeteer.launch({
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote', '--single-process'],
      headless: true,
      timeout: 60000,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfRaw = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });
    return Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
  } finally {
    if (browser) await browser.close();
  }
}

/* ============================================================================
 * ASYNCHRONOUS PDF GENERATION WORKER
 * ============================================================================ */

async function performPdfGeneration(jobId: string, payload: PdfJob['requestPayload']) {
  const { places, tripLength, cityName } = payload;
  try {
    await updatePdfJob(jobId, { status: 'PROCESSING' });

    if (!mapsKey) mapsKey = await getSecret(MAPS_SECRET);
    const enriched = await enrichPlaces(places, mapsKey, cityName);

    const guide = await generateCityGuideJson(cityName, enriched);
    const compressedImages = await processImages(enriched, guide.coverPhotoSuggestion);

    const [itinerary, dreamers] = await Promise.all([
      generateItineraryJson(enriched, tripLength, cityName),
      generateDreamersJson(cityName),
    ]);

    // --- THE CORRECTED FUNCTION CALL ---
    // Now passing all 6 arguments in the correct order.
    const html = await buildHtml(guide, itinerary, enriched, cityName, dreamers, compressedImages);
    
    let pdf: Buffer;
    try {
        pdf = await generatePdf(html);
    } catch (puppeteerError) {
        console.error("Puppeteer-specific error during PDF generation:", puppeteerError);
        throw new Error("Failed during PDF rendering. The service may be under heavy load or out of resources.");
    }

    const filename = createFilename(cityName, tripLength);
    const gcsPath = `jobs/${jobId}/${filename}`;
    const file = storage.bucket(BUCKET_NAME).file(gcsPath);
    await file.save(pdf, { contentType: 'application/pdf' });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    await updatePdfJob(jobId, { status: 'COMPLETE', pdfUrl: url });
    console.log(`Successfully completed PDF generation for job ${jobId}`);

  } catch (error: unknown) {
    console.error(`PDF Generation failed for job ${jobId}:`, error);
    const err = error as Error;
    await updatePdfJob(jobId, { status: 'FAILED', error: err.message });
  }
}

/* ============================================================================
 * API ROUTE HANDLERS
 * ============================================================================ */

export async function POST(req: NextRequest) {
  try {
    const payload: PdfJob['requestPayload'] = await req.json();
    const { places } = payload;

    if (!Array.isArray(places) || !places.length) {
      return NextResponse.json({ error: 'Missing or invalid "places" array.' }, { status: 400 });
    }

    const jobId = crypto.randomUUID();
    await createPdfJob(jobId, payload);

    performPdfGeneration(jobId, payload);

    console.log(`Accepted PDF generation job with ID: ${jobId}`);
    return NextResponse.json({ jobId }, { status: 202 });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to initiate PDF job:', err.message);
    return NextResponse.json({ error: 'Failed to start PDF generation job.', details: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }

  try {
    const job = await getPdfJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`Failed to get status for job ${jobId}:`, err.message);
    return NextResponse.json({ error: 'Failed to retrieve job status.', details: err.message }, { status: 500 });
  }
}