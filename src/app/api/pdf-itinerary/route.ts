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
 * CONFIGURATION
 * ============================================================================ */
const GEMINI_SECRET = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET   = 'projects/934477100130/secrets/places-api-key/versions/latest';
const BUCKET_NAME   = 'citybreaker-downloads';
const GEMINI_MODEL  = 'gemini-2.5-flash';
const MAX_AI_RETRIES = 3;

const SOURCE_IMAGE_WIDTH    = 1200;
const COVER_IMAGE_WIDTH     = 1000;
const ACTIVITY_IMAGE_WIDTH  = 500;

const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_PHOTO_BASE_URL  = 'https://places.googleapis.com/v1';

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

  // Inline Google Fonts once on cold start
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

  // Launch Chromium once
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';
  const dir = readdirSync(browsersPath).find(d => d.startsWith('chromium-'))!;
  const executablePath = path.join(browsersPath, dir, 'chrome-linux', 'chrome');
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-breakpad'],
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

function parseLlmJson<T>(raw: string): T {
  const m = raw.match(/{[\s\S]*}/);
  if (!m) throw new SyntaxError('No JSON object in LLM response');
  return JSON.parse(m[0]) as T;
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
  const cached = await getManyPlaceEnrichments(names);
  const enriched: EnrichedPlace[] = [];
  const toFetch: string[] = [];
  for (const name of names) {
    const key = placeKeyFromName(name);
    const entry = cached.get(key);
    if (entry && isPlaceFresh(entry)) enriched.push(entry.place);
    else toFetch.push(name);
  }
  const fetched = await Promise.all(
    toFetch.map(async name => {
      try {
        const res = await fetch(PLACES_SEARCH_TEXT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.photos',
          },
          body: JSON.stringify({ textQuery: `${name} in ${city}` }),
        });
        const data = await res.json();
        const p = data.places?.[0];
        const result: EnrichedPlace = p
          ? {
              name: p.displayName.text,
              photoUrl: `${PLACES_PHOTO_BASE_URL}/${p.photos?.[0]?.name}/media?key=${apiKey}&maxWidthPx=${SOURCE_IMAGE_WIDTH}`,
              website: p.websiteUri,
              googleMapsUrl: p.googleMapsUri,
              placeId: p.id,
            }
          : { name };
        await upsertPlaceEnrichment(name, result);
        return result;
      } catch (e) {
        return { name };
      }
    })
  );
  return [...enriched, ...fetched.filter(Boolean)];
}

async function processImages(
  places: EnrichedPlace[],
  coverSuggestion: string
): Promise<Map<string, string>> {
  const promises = places.map(async p => {
    if (!p.photoUrl) return null;
    const buf = await fetch(p.photoUrl).then(r => r.arrayBuffer());
    const isCover = p.name === coverSuggestion;
    const width = isCover ? COVER_IMAGE_WIDTH : ACTIVITY_IMAGE_WIDTH;
    const q = isCover ? 80 : 75;
    const out = await sharp(Buffer.from(buf)).resize({ width }).webp({ quality: q }).toBuffer();
    return [p.name, `data:image/webp;base64,${out.toString('base64')}`] as [string, string];
  });
  const arr = await Promise.all(promises);
  return new Map(arr.filter(Boolean) as [string, string][]);
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
      const list = places.map(p => `"${p.name}"`).join(', ');
      const prompt = `You are a travel guide API. Your only output is JSON. For a ${days}-day trip to ${city}, generate an itinerary from places: [${list}]`;
      const r = await model.generateContent(prompt);
      const txt = await r.response.text();
      return parseLlmJson<{ itinerary: ItineraryDayCache[] }>(txt).itinerary;
    } catch (e) {
      if (i === MAX_AI_RETRIES - 1) throw e;
    }
  }
  throw new Error('Failed to generate itinerary');
}

async function generateCityGuideJson(
  city: string,
  places: EnrichedPlace[]
): Promise<{ tagline: string; coverPhotoSuggestion: string; airportTransport: any; publicTransport: any; proTips: any }> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await fetchSecretOnce(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const names = places.map(p => p.name).join(', ');
      const prompt = `You are a travel guide API. Output JSON with tagline, coverPhotoSuggestion (one of [${names}]), airportTransport, publicTransport, proTips for ${city}.`;
      const r = await model.generateContent(prompt);
      const txt = await r.response.text();
      return parseLlmJson<any>(txt).guide;
    } catch (e) {
      if (i === MAX_AI_RETRIES - 1) throw e;
    }
  }
  throw new Error('Failed to generate guide');
}

async function generateDreamersJson(city: string) {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await fetchSecretOnce(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const prompt = `You are a career advisor API. Output JSON with 2-4 dreamers for ${city}.`;
      const r = await model.generateContent(prompt);
      const txt = await r.response.text();
      return parseLlmJson<any>(txt).dreamers;
    } catch (e) {
      if (i === MAX_AI_RETRIES - 1) throw e;
    }
  }
  throw new Error('Failed to generate dreamers');
}

async function buildHtml(
  guide: any,
  itinerary: ItineraryDayCache[],
  places: EnrichedPlace[],
  city: string,
  dreamers: any[],
  imgs: Map<string, string>
): Promise<string> {
  const logo = await fsp.readFile(path.join(process.cwd(), 'public/logo/citybreaker.png')).catch(() => null);
  const logoBase = logo ? `data:image/png;base64,${logo.toString('base64')}` : '';
  const cover = imgs.get(guide.coverPhotoSuggestion) || Array.from(imgs.values())[0] || '';
  const styles = `<style>${fontCss}\n:root{--serif:'Playfair Display',serif;--sans:'Inter',sans-serif}</style>`;
  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${city}</title>${styles}</head><body>`;
  // cover
  html += `<section class="page cover" style="background-image:url('${cover}')"><img src="${logoBase}" alt="Logo"><h1>${city}</h1><p>${guide.tagline}</p></section>`;
  // itinerary
  itinerary.forEach((d, idx) => {
    html += `<section class="page day"><h2>Day ${idx+1}: ${d.title}</h2>`;
    d.activities.forEach(a => {
      const img = imgs.get(a.placeName) || '';
      html += `<article><img src="${img}"><h3>${a.title}</h3><p>${a.description}</p></article>`;
    });
    html += `</section>`;
  });
  // dreamers
  if (dreamers.length) {
    html += `<section class="page dreamers"><h2>Dreamers</h2>`;
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
    mapsKey   = await fetchSecretOnce(MAPS_SECRET);
    geminiKey = await fetchSecretOnce(GEMINI_SECRET);

    const enriched = await enrichPlaces(places, mapsKey, cityName);
    const guide    = await generateCityGuideJson(cityName, enriched);
    const imgs     = await processImages(enriched, guide.coverPhotoSuggestion);
    const [itin, dreamers] = await Promise.all([
      generateItineraryJson(enriched, tripLength, cityName),
      generateDreamersJson(cityName)
    ]);

    const html = await buildHtml(guide, itin, enriched, cityName, dreamers, imgs);
    const pdfBuffer = await generatePdf(html);

    const filename = createFilename(cityName, tripLength);
    const file = storage.bucket(BUCKET_NAME).file(`jobs/${jobId}/${filename}`);
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 86400000 });
    await updatePdfJob(jobId, { status: 'COMPLETE', pdfUrl: url });
  } catch (error: any) {
    await updatePdfJob(jobId, { status: 'FAILED', error: error.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: PdfJob['requestPayload'] = await req.json();
    if (!Array.isArray(payload.places) || !payload.places.length) {
      return NextResponse.json({ error: 'Missing or invalid \'places\' array.' }, { status: 400 });
    }
    const jobId = crypto.randomUUID();
    await createPdfJob(jobId, payload);
    performPdfGeneration(jobId, payload);
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to start PDF job.', details: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  const job = await getPdfJob(jobId);
  return job ? NextResponse.json(job) : NextResponse.json({ error: 'Job not found' }, { status: 404 });
}
