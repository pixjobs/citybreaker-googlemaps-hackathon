export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { chromium, Browser, BrowserContext } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { promises as fsp } from 'node:fs';
import { readdirSync } from 'fs';
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
 * GLOBAL INIT (REUSE FOR PERFORMANCE & INLINE FONTS)
 * ============================================================================ */
const storage = new Storage();
const smClient = new SecretManagerServiceClient();
let geminiKey: string | null = null;
let mapsKey: string | null = null;
let browser: Browser;
let context: BrowserContext;
let fontCss: string;

async function initBrowser() {
  if (browser) return;

  // 1. Download and inline Google Fonts CSS + woff2 at first start
  const fontResponse = await fetch(
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap'
  );
  let css = await fontResponse.text();
  const urls = Array.from(css.matchAll(/url\((https:[^)]+)\)/g)).map(m => m[1]);
  for (const url of urls) {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    css = css.replace(url, `data:font/woff2;base64,${b64}`);
  }
  fontCss = css;

  // 2. Launch Chromium once for repeated use
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';
  const dir = readdirSync(browsersPath).find(d => d.startsWith('chromium-'))!;
  const executablePath = path.join(browsersPath, dir, 'chrome-linux', 'chrome');
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-breakpad']
  });
  context = await browser.newContext();
}

async function getSecret(name: string): Promise<string> {
  const [version] = await smClient.accessSecretVersion({ name });
  const data = version.payload?.data?.toString();
  if (!data) throw new Error(`Secret ${name} is empty or could not be retrieved.`);
  return data;
}

/* ============================================================================
 * UTILITIES & CACHE
 * ============================================================================ */
const secretCache: Record<string, string> = {};
async function fetchSecretOnce(name: string) {
  if (!secretCache[name]) secretCache[name] = await getSecret(name);
  return secretCache[name];
}

function createFilename(city: string, days: number): string {
  const safeCity = city.trim().replace(/\W+/g, '_');
  return `${safeCity}_${days}d_Guide.pdf`;
}

function parseLlmJson<T>(rawText: string): T {
  const match = rawText.match(/{[\s\S]*}/);
  if (!match) throw new SyntaxError('No valid JSON object found in the LLM response.');
  return JSON.parse(match[0]) as T;
}

/* ============================================================================
 * CORE HELPERS & GENERATION LOGIC
 * ============================================================================ */
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
  const newlyFetched = await Promise.all(
    placesToFetch.map(async name => {
      try {
        const res = await fetch(
          PLACES_SEARCH_TEXT_URL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.photos'
            },
            body: JSON.stringify({ textQuery: `${name} in ${city}` })
          }
        );
        const data = await res.json();
        const place = data.places?.[0];
        const enriched: EnrichedPlace = place
          ? {
              name: place.displayName.text,
              photoUrl: `${PLACES_PHOTO_BASE_URL}/${place.photos?.[0]?.name}/media?key=${apiKey}&maxWidthPx=${SOURCE_IMAGE_WIDTH}`,
              website: place.websiteUri,
              googleMapsUrl: place.googleMapsUri,
              placeId: place.id
            }
          : { name };
        await upsertPlaceEnrichment(name, enriched);
        return enriched;
      } catch {
        return { name };
      }
    })
  );
  return [...enrichedPlaces, ...newlyFetched.filter(p => p)];
}

async function processImages(
  enrichedPlaces: EnrichedPlace[],
  coverPhotoSuggestion: string
): Promise<Map<string, string>> {
  const imagePromises = enrichedPlaces.map(async place => {
    if (!place.photoUrl) return null;
    const buffer = await fetch(place.photoUrl).then(r => r.arrayBuffer());
    const isCover = place.name === coverPhotoSuggestion;
    const targetWidth = isCover ? COVER_IMAGE_WIDTH : ACTIVITY_IMAGE_WIDTH;
    const quality = isCover ? 80 : 75;
    const out = await sharp(Buffer.from(buffer))
      .resize({ width: targetWidth })
      .webp({ quality })
      .toBuffer();
    return [place.name, `data:image/webp;base64,${out.toString('base64')}`] as [string, string];
  });
  const results = await Promise.all(imagePromises);
  return new Map(results.filter(r => r) as [string, string][]);
}

async function generateItineraryJson(
  places: EnrichedPlace[],
  days: number,
  city: string
): Promise<ItineraryDayCache[]> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await fetchSecretOnce(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const placeList = places.map(p => `"${p.name}"`).join(', ');
      const prompt = `You are a travel guide API. Your only output is a single, valid JSON object. For a ${days}-day trip to ${city}, generate an itinerary using these places: [${placeList}]`;
      const res = await model.generateContent(prompt);
      const text = await res.response.text();
      return parseLlmJson<{ itinerary: ItineraryDayCache[] }>(text).itinerary;
    } catch {
      if (i === MAX_AI_RETRIES - 1) throw;
    }
  }
}

async function generateCityGuideJson(
  city: string,
  places: EnrichedPlace[]
): Promise<CityGuide> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await fetchSecretOnce(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const placeNames = places.map(p => p.name).join(', ');
      const prompt = `You are a travel guide API. For ${city}, generated a guide including tagline, cover suggestion, transport tips.`;
      const res = await model.generateContent(prompt);
      const text = await res.response.text();
      return parseLlmJson<CityGuide>(text);
    } catch {
      if (i === MAX_AI_RETRIES - 1) throw;
    }
  }
}

async function generateDreamersJson(city: string): Promise<DreamerRec[]> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await fetchSecretOnce(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const prompt = `You are a career advisor API. For ${city}, list 2-4 universities or tech hubs.`;
      const res = await model.generateContent(prompt);
      const text = await res.response.text();
      return parseLlmJson<DreamerRec[]>(text);
    } catch {
      if (i === MAX_AI_RETRIES - 1) throw;
    }
  }
}

async function buildHtml(
  guide: CityGuide,
  itinerary: ItineraryDayCache[],
  enriched: EnrichedPlace[],
  city: string,
  dreamers: DreamerRec[],
  compressedImages: Map<string, string>
): Promise<string> {
  const logoBase64 = await fsp.readFile(path.join(process.cwd(), 'public/logo/citybreaker.png'), 'base64').catch(() => '');
  const coverPlace = enriched.find(p => p.name === guide.coverPhotoSuggestion);
  let coverPhotoUrl = coverPlace ? compressedImages.get(coverPlace.name) || '' : '';
  if (!coverPhotoUrl && compressedImages.size) {
    coverPhotoUrl = Array.from(compressedImages.values())[0];
  }

  const styles = `<style>${fontCss}@import url('');:root{--serif:'Playfair Display',serif;--sans:'Inter',sans-serif;--brand:#E6C670;--bg:#181818;--text:#EAEAEA}.page{page-break-after:always}.cover-page{background:url('${coverPhotoUrl}') center/cover}.pill{background:var(--brand)}</style>`;

  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${city}</title>${styles}</head><body>`;
  html += `<section class="page cover-page"><h1>${city}</h1><p>${guide.tagline}</p></section>`;

  itinerary.forEach((day, idx) => {
    html += `<section class="page"><h2>Day ${idx+1}: ${day.title}</h2>`;
    day.activities.forEach(act => {
      const img = compressedImages.get(act.placeName) || '';
      html += `<article><img src="${img}" alt=""><h3>${act.title}</h3><p>${act.description}</p></article>`;
    });
    html += `</section>`;
  });

  if (dreamers.length) {
    html += `<section class="page"><h2>Dreamers</h2>`;
    dreamers.forEach(d => html += `<div><h3>${d.name}${d.area?` · ${d.area}`:''}</h3><p>${d.note||''}</p><a href="${d.url}">${d.url}</a></div>`);
    html += `</section>`;
  }

  html += `</body></html>`;
  return html;
}

async function generatePdf(html: string): Promise<Buffer> {
  await initBrowser();
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top:0, right:0, bottom:0, left:0 } });
  await page.close();
  return pdf;
}

async function performPdfGeneration(jobId: string, payload: PdfJob['requestPayload']) {
  const { places, tripLength, cityName } = payload;
  try {
    await updatePdfJob(jobId, { status: 'PROCESSING' });
    mapsKey = await fetchSecretOnce(MAPS_SECRET);
    geminiKey = await fetchSecretOnce(GEMINI_SECRET);

    const enriched = await enrichPlaces(places, mapsKey, cityName);
    const guide = await generateCityGuideJson(cityName, enriched);
    const compressed = await processImages(enriched, guide.coverPhotoSuggestion);
    const [itinerary, dreamers] = await Promise.all([
      generateItineraryJson(enriched, tripLength, cityName),
      generateDreamersJson(cityName),
    ]);

    const html = await buildHtml(guide, itinerary, enriched, cityName, dreamers, compressed);
    const pdfBuffer = await generatePdf(html);

    const filename = createFilename(cityName, tripLength);
    const file = storage.bucket(BUCKET_NAME).file(`jobs/${jobId}/${filename}`);
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24*60*60*1000 });

    await updatePdfJob(jobId, { status: 'COMPLETE', pdfUrl: url });
  } catch (error:any) {
    await updatePdfJob(jobId, { status: 'FAILED', error: error.message });
  }
}

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
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e:any) {
    return NextResponse.json({ error: 'Failed to start PDF job.', details: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  const job = await getPdfJob(jobId);
  return job ? NextResponse.json(job) : NextResponse.json({ error: 'Job not found' }, { status: 404 });
}
