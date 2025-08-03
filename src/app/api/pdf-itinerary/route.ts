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
  CityGuide,
  DreamerRec,
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

async function initBrowser(): Promise<void> {
  if (browser) return;

  // Inline Google Fonts on cold start
  const fontResponse = await fetch(
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap'
  );
  let css = await fontResponse.text();
  for (const m of css.matchAll(/url\((https:[^)]+)\)/g)) {
    const url = m[1];
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
  if (!data) throw new Error(`Secret ${name} is empty or unreadable.`);
  return data;
}

/* ============================================================================
 * UTILITIES & CACHE
 * ============================================================================ */
const secretCache: Record<string, string> = {};
async function fetchSecretOnce(name: string): Promise<string> {
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
  const cache = await getManyPlaceEnrichments(names);
  const enriched: EnrichedPlace[] = [];
  const toFetch: string[] = [];
  for (const name of names) {
    const key = placeKeyFromName(name);
    const entry = cache.get(key);
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
              website: p.websiteUri ?? '',
              googleMapsUrl: p.googleMapsUri ?? '',
              placeId: p.id,
            }
          : { name };
        await upsertPlaceEnrichment(name, result);
        return result;
      } catch {
        return { name };
      }
    })
  );
  return [...enriched, ...fetched.filter(p => p.name)];
}

async function processImages(
  places: EnrichedPlace[],
  coverSuggestion: string
): Promise<Map<string, string>> {
  const arr = await Promise.all(
    places.map(async p => {
      if (!p.photoUrl) return null;
      const buf = await fetch(p.photoUrl).then(r => r.arrayBuffer());
      const isCover = p.name === coverSuggestion;
      const width = isCover ? COVER_IMAGE_WIDTH : ACTIVITY_IMAGE_WIDTH;
      const quality = isCover ? 80 : 75;
      const out = await sharp(Buffer.from(buf)).resize({ width }).webp({ quality }).toBuffer();
      return [p.name, `data:image/webp;base64,${out.toString('base64')}`] as [string, string];
    })
  );
  return new Map(arr.filter((x): x is [string,string] => !!x));
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
      const prompt = `You are a travel guide API. Your only output is a single JSON object. For a ${days}-day trip to ${city}, generate an itinerary using these places: [${list}]`;
      const res = await model.generateContent(prompt);
      const txt = await res.response.text();
      return parseLlmJson<{ itinerary: ItineraryDayCache[] }>(txt).itinerary;
    } catch (err) {
      if (i === MAX_AI_RETRIES - 1) throw err;
    }
  }
  throw new Error('Itinerary generation failed');
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
      const names = places.map(p => p.name).join(', ');
      const prompt = `You are a travel guide API. Output a JSON object with key \"guide\" matching CityGuide type for ${city} using [${names}]`;
      const res = await model.generateContent(prompt);
      const txt = await res.response.text();
      return parseLlmJson<{ guide: CityGuide }>(txt).guide;
    } catch (err) {
      if (i === MAX_AI_RETRIES - 1) throw err;
    }
  }
  throw new Error('City guide generation failed');
}

async function generateDreamersJson(city: string): Promise<DreamerRec[]> {
  for (let i = 0; i < MAX_AI_RETRIES; i++) {
    try {
      if (!geminiKey) geminiKey = await fetchSecretOnce(GEMINI_SECRET);
      const client = new GoogleGenerativeAI(geminiKey);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      const prompt = `You are a career advisor API. Output JSON with key \"dreamers\" as DreamerRec[] for ${city}`;
      const res = await model.generateContent(prompt);
      const txt = await res.response.text();
      return parseLlmJson<{ dreamers: DreamerRec[] }>(txt).dreamers;
    } catch (err) {
      if (i === MAX_AI_RETRIES - 1) throw err;
    }
  }
  throw new Error('Dreamers generation failed');
}

async function buildHtml(
  guide: CityGuide,
  itinerary: ItineraryDayCache[],
  places: EnrichedPlace[],
  city: string,
  dreamers: DreamerRec[],
  imgs: Map<string, string>
): Promise<string> {
  const logoBuf = await fsp.readFile(path.join(process.cwd(), 'public/logo/citybreaker.png')).catch(() => null);
  const logoBase = logoBuf ? `data:image/png;base64,${logoBuf.toString('base64')}` : '';
  const coverImg = imgs.get(guide.coverPhotoSuggestion) || Array.from(imgs.values())[0] || '';
  const styles = `<style>${fontCss}\n:root{--serif:'Playfair Display',serif;--sans:'Inter',sans-serif}</style>`;
  let html = `<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>${city}</title>${styles}</head><body>`;
  html += `<section class=\"page cover\" style=\"background-image:url('${coverImg}')\"><img src=\"${logoBase}\" alt=\"Logo\"><h1>${city}</h1><p>${guide.tagline}</p></section>`;
  itinerary.forEach((day, idx) => {
    html += `<section class=\"page day\"><h2>Day ${idx + 1}: ${day.title}</h2>`;
    day.activities.forEach(act => {
      const img = imgs.get(act.placeName) || '';
      html += `<article><img src=\"${img}\"><h3>${act.title}</h3><p>${act.description}</p></article>`;
    });
    html += `</section>`;
  });
  if (dreamers.length) {
    html += `<section class=\"page dreamers\"><h2>Dreamers</h2>`;
    dreamers.forEach(d => {
      html += `<div><h3>${d.name}${d.area ? ` · ${d.area}` : ''}</h3><p>${d.note || ''}</p><a href=\"${d.url}\">${d.url}</a></div>`;
    });
    html += `</section>`;
  }
  html += `</body></html>`;
  return html;
}

async function generatePdf(html: string): Promise<Buffer> {
  await initBrowser();
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
  return pdf;
}

async function performPdfGeneration(jobId: string, payload: PdfJob['requestPayload']): Promise<void> {
  const { places, tripLength, cityName } = payload;
  try {
    await updatePdfJob(jobId, { status: 'PROCESSING' });
    mapsKey = await fetchSecretOnce(MAPS_SECRET);
    geminiKey = await fetchSecretOnce(GEMINI_SECRET);

    const enriched = await enrichPlaces(places, mapsKey, cityName);
    const guide     = await generateCityGuideJson(cityName, enriched);
    const imgs      = await processImages(enriched, guide.coverPhotoSuggestion);
    const [itin, dreamers] = await Promise.all([
      generateItineraryJson(enriched, tripLength, cityName),
      generateDreamersJson(cityName),
    ]);

    const html = await buildHtml(guide, itin, enriched, cityName, dreamers, imgs);
    const pdfBuffer = await generatePdf(html);

    const filename = createFilename(cityName, tripLength);
    const file = storage.bucket(BUCKET_NAME).file(`jobs/${jobId}/${filename}`);
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
    await updatePdfJob(jobId, { status: 'COMPLETE', pdfUrl: url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updatePdfJob(jobId, { status: 'FAILED', error: msg });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const payload: PdfJob['requestPayload'] = await req.json();
    if (!Array.isArray(payload.places) || payload.places.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid places array' }, { status: 400 });
    }
    const jobId = crypto.randomUUID();
    await createPdfJob(jobId, payload);
    performPdfGeneration(jobId, payload);
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to start PDF job', details: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }
  try {
    const job = await getPdfJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to retrieve job status', details: msg }, { status: 500 });
  }
}
