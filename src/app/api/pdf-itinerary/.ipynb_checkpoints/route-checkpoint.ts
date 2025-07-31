export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

/* ==============================
 * Config
 * ============================== */
const GEMINI_SECRET = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET   = 'projects/934477100130/secrets/places-api-key/versions/latest';
const BUCKET_NAME   = 'citybreaker-downloads';
const GEMINI_MODEL  = 'gemini-2.5-pro';

const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_PHOTO_BASE_URL  = 'https://places.googleapis.com/v1';

/* ==============================
 * Clients & in-memory caches
 * ============================== */
const storage = new Storage();
const smClient = new SecretManagerServiceClient();
let geminiKey: string | null = null;
let mapsKey: string | null = null;

const PLACE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;  // 7 days
const PDF_CACHE_TTL_MS   = 1000 * 60 * 60 * 24;      // 24 hours

interface EnrichedPlace {
  name: string;
  photoUrl?: string;
  website?: string;
  tripAdvisorUrl?: string;
  googleMapsUrl?: string;
}

interface ItineraryActivity {
  title: string;
  description: string;
  whyVisit: string;
  insiderTip: string;
  placeName: string;
  priceRange: string;
  audience: string;
}

interface ItineraryDay {
  title: string;
  activities: ItineraryActivity[];
}

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

const placeDetailsCache = new Map<string, EnrichedPlace>();   // key -> place
const pdfCache = new Map<string, string>();                   // key -> signed URL

function setCache<T>(cache: Map<string, T>, key: string, value: T, ttl: number): void {
  cache.set(key, value);
  setTimeout(() => cache.delete(key), ttl);
}
function getCache<T>(cache: Map<string, T>, key: string): T | undefined {
  return cache.get(key);
}

/* ==============================
 * Helpers
 * ============================== */
async function getSecret(name: string): Promise<string> {
  const [version] = await smClient.accessSecretVersion({ name });
  const secretValue = version.payload?.data?.toString();
  if (!secretValue) throw new Error(`Secret ${name} is empty or could not be retrieved.`);
  return secretValue;
}

function createFilename(city: string, days: number): string {
  const safeCity = city.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return `${safeCity}_${days}d_Guide.pdf`;
}

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-');
}

/* ==============================
 * Place enrichment (with cache)
 * ============================== */
async function enrichPlaces(
  places: { name: string }[],
  apiKey: string,
  city: string
): Promise<EnrichedPlace[]> {
  return Promise.all(
    places.map(async ({ name }) => {
      const originalName = name?.trim();
      if (!originalName) return { name: 'Unnamed Place' };
      const searchQuery = `${originalName} in ${city}`;
      const cacheKey = `place-details:${slug(searchQuery)}`;
      const cached = getCache(placeDetailsCache, cacheKey);
      if (cached) return cached;

      try {
        const requestBody = { textQuery: searchQuery };
        const requestHeaders = {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.photos',
        };
        const res = await fetch(PLACES_SEARCH_TEXT_URL, {
          method: 'POST', headers: requestHeaders, body: JSON.stringify(requestBody),
        });
        if (!res.ok) throw new Error(`Places API error: ${res.status} - ${await res.text()}`);

        const data = await res.json();
        const place = data.places?.[0];
        if (!place) return { name: originalName };

        const photoName = place.photos?.[0]?.name as string | undefined;
        const photoUrl = photoName
          ? `${PLACES_PHOTO_BASE_URL}/${photoName}/media?key=${apiKey}&maxHeightPx=1200`
          : undefined;

        const enriched: EnrichedPlace = {
          name: place.displayName?.text || originalName,
          photoUrl,
          website: place.websiteUri,
          googleMapsUrl: place.googleMapsUri,
          tripAdvisorUrl: `https://www.tripadvisor.com/Search?q=${encodeURIComponent(searchQuery)}`,
        };
        setCache(placeDetailsCache, cacheKey, enriched, PLACE_CACHE_TTL_MS);
        return enriched;
      } catch (error) {
        console.error(`Failed to enrich place: ${originalName}`, error);
        return { name: originalName };
      }
    })
  );
}

/* ==============================
 * Gemini generation (Pro)
 * ============================== */
async function generateItineraryJson(
  places: EnrichedPlace[],
  days: number,
  city: string
): Promise<ItineraryDay[]> {
  if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
  const client = new GoogleGenerativeAI(geminiKey);
  const model = client.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: { responseMimeType: 'application/json' } });

  const placeList = places.map((p) => `"${p.name}"`).join(', ');
  const prompt =
    `You are a world-class travel concierge creating a premium, compact itinerary for ${city}.\n` +
    `Reply with a SINGLE JSON object: {"itinerary":[{...}]}\n` +
    `For a ${days}-day trip, each day has:\n` +
    `  - "title"\n` +
    `  - "activities": EXACTLY 2 entries with { "title", "placeName"(from [${placeList}]), "priceRange" (Free/$/$$/$$$), "audience", "description"(~22-28 words), "whyVisit"(<=10 words), "insiderTip"(<=10 words) }.\n` +
    `Make the writing polished and magazine-ready.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  try {
    const parsed = JSON.parse(text) as { itinerary?: ItineraryDay[] };
    if (!Array.isArray(parsed.itinerary)) throw new Error('Missing itinerary array');
    return parsed.itinerary;
  } catch (e) {
    console.error('Gemini itinerary parse error:', text, e);
    throw new Error('Could not generate a valid itinerary structure.');
  }
}

async function generateCityGuideJson(city: string, places: EnrichedPlace[]): Promise<CityGuide> {
  if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
  const client = new GoogleGenerativeAI(geminiKey);
  const model = client.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: { responseMimeType: 'application/json' } });

  const placeNames = places.map((p) => p.name).join(', ');
  const prompt =
    `You are a professional travel guide writer. For ${city}, produce a SINGLE JSON object {"guide":{...}}\n` +
    `"guide" has: "tagline", "coverPhotoSuggestion"(ONE from [${placeNames}]),\n` +
    `"airportTransport":{title,content(55-70 words)}, "publicTransport":{title,content(55-70 words)}, "proTips":{title,content(55-70 words)}.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  try {
    const parsed = JSON.parse(text) as { guide?: CityGuide };
    if (!parsed.guide) throw new Error('Missing guide');
    return parsed.guide;
  } catch (e) {
    console.error('Gemini city guide parse error:', text, e);
    return {
      tagline: 'Your Unforgettable Journey',
      coverPhotoSuggestion: places[0]?.name || 'city view',
      airportTransport: { title: 'Arrival & Airport Transit', content: 'Information currently unavailable.' },
      publicTransport: { title: 'Navigating The City', content: 'Information currently unavailable.' },
      proTips: { title: 'Insider Knowledge', content: 'Information currently unavailable.' },
    };
  }
}

/* ==============================
 * Dreamers / Engineers page
 * ============================== */
function dreamersForCity(city: string): DreamerRec[] {
  const key = slug(city);
  if (/(^|-)london$/.test(key)) {
    return [
      { name: 'Imperial College London', area: 'South Kensington', url: 'https://www.imperial.ac.uk/', note: 'Engineering, science & innovation; White City campus & Enterprise Lab.' },
      { name: 'UCL (University College London)', area: 'Bloomsbury', url: 'https://www.ucl.ac.uk/', note: 'Broad research powerhouse; AI, data science, built environment.' },
      { name: 'King’s College London', area: 'Strand / Waterloo', url: 'https://www.kcl.ac.uk/', note: 'Health, policy, and emerging tech collaborations.' },
      { name: 'LSE (London School of Economics)', area: 'Aldwych', url: 'https://www.lse.ac.uk/', note: 'Economics & entrepreneurship ecosystems intersecting with tech.' },
    ];
  }
  if (/san(-)?francisco|bay(-)?area|berkeley|oakland|silicon(-)?valley/.test(key)) {
    return [
      { name: 'Stanford University', area: 'Palo Alto', url: 'https://www.stanford.edu/', note: 'Engineering, AI & startup DNA near Sand Hill Road.' },
      { name: 'UC Berkeley', area: 'Berkeley', url: 'https://www.berkeley.edu/', note: 'EECS, robotics, Berkeley SkyDeck accelerator.' },
      { name: 'UCSF', area: 'Mission Bay', url: 'https://www.ucsf.edu/', note: 'Biomedical research & biotech hub.' },
    ];
  }
  return [
    { name: 'MIT', url: 'https://www.mit.edu/', note: 'Engineering & entrepreneurship, Cambridge MA.' },
    { name: 'ETH Zürich', url: 'https://ethz.ch/', note: 'Robotics, materials, and deep tech, Switzerland.' },
    { name: 'Stanford University', url: 'https://www.stanford.edu/', note: 'Engineering, AI, and startups, Bay Area.' },
  ];
}

/* ==============================
 * Logo helper (async, no sync fs)
 * ============================== */
let logoBase64Cache: string | null = null;
async function getLogoBase64(): Promise<string> {
  if (logoBase64Cache !== null) return logoBase64Cache;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');
    const buf = await fsp.readFile(logoPath);
    logoBase64Cache = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    logoBase64Cache = '';
  }
  return logoBase64Cache;
}

/* ==============================
 * HTML (Magazine-style, compact)
 * ============================== */
async function buildHtml(
  guide: CityGuide,
  itinerary: ItineraryDay[],
  enriched: EnrichedPlace[],
  city: string
): Promise<string> {
  const logoBase64 = await getLogoBase64();

  const coverPlace = enriched.find((p) => p.name === guide.coverPhotoSuggestion);
  const coverPhotoUrl = coverPlace?.photoUrl || enriched.find((p) => p.photoUrl)?.photoUrl || '';

  const coverPageHtml = `
    <section class="page cover-page" style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.78) 100%), url('${coverPhotoUrl}');">
      <div class="cover-content">
        ${logoBase64 ? `<img src="${logoBase64}" class="cover-logo" />` : ''}
        <h1 class="cover-title">${city}</h1>
        <p class="cover-tagline">${guide.tagline}</p>
      </div>
      <div class="cover-guide-container">
        <div class="guide-col"><h3>${guide.airportTransport.title}</h3><p>${guide.airportTransport.content}</p></div>
        <div class="guide-col"><h3>${guide.publicTransport.title}</h3><p>${guide.publicTransport.content}</p></div>
        <div class="guide-col"><h3>${guide.proTips.title}</h3><p>${guide.proTips.content}</p></div>
      </div>
    </section>
  `;

  let itineraryHtml = '';
  let pageCounter = 2;

  itinerary.forEach((day, dayIndex) => {
    for (let i = 0; i < day.activities.length; i += 2) {
      const chunk = day.activities.slice(i, i + 2);
      const activitiesHtml = chunk
        .map((activity) => {
          const place = enriched.find((p) => p.name === activity.placeName);
          const websiteLink = place?.website ? `<a href="${place.website}">Official</a>` : '';
          const mapsLink = place?.googleMapsUrl ? `<a href="${place.googleMapsUrl}">Maps</a>` : '';
          const taLink = place?.tripAdvisorUrl ? `<a href="${place.tripAdvisorUrl}">TripAdvisor</a>` : '';
          return `
            <article class="activity">
              <div class="image">
                ${place?.photoUrl ? `<img src="${place.photoUrl}" alt="${activity.title}" />` : '<div class="no-image"></div>'}
              </div>
              <div class="content">
                <div class="meta">
                  <span class="pill">${activity.priceRange}</span>
                  <span class="pill">${activity.audience}</span>
                </div>
                <h3>${activity.title}</h3>
                <p class="desc">${activity.description}</p>
                <div class="kv">
                  <div><label>Why</label><p>${activity.whyVisit}</p></div>
                  <div><label>Tip</label><p>${activity.insiderTip}</p></div>
                </div>
                <div class="links">
                  ${websiteLink} ${mapsLink} ${taLink}
                </div>
              </div>
            </article>
          `;
        })
        .join('');

      itineraryHtml += `
        <section class="page it-page">
          <header class="head">
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-small" />` : ''}
            <div class="head-text"><h1>${city}</h1><span>Curated Itinerary</span></div>
          </header>
          ${i === 0 ? `<div class="day-title"><h2>Day ${dayIndex + 1}</h2><h1>${day.title}</h1></div>` : '<div class="day-title placeholder"></div>'}
          <div class="acts">${activitiesHtml}</div>
          <footer class="foot"><p>CityBreaker</p><p>${pageCounter}</p></footer>
        </section>
      `;
      pageCounter++;
    }
  });

  const dreamers = dreamersForCity(city);
  const dreamersHtml = dreamers
    .map(
      (d) => `
    <div class="dre-card">
      <h3>${d.name}${d.area ? ` · <span class="area">${d.area}</span>` : ''}</h3>
      ${d.note ? `<p class="dre-note">${d.note}</p>` : ''}
      <p class="dre-link"><a href="${d.url}">${d.url.replace(/^https?:\/\//, '')}</a></p>
    </div>
  `
    )
    .join('');

  const dreamersPage = `
    <section class="page dre-page">
      <header class="dre-head">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-small" />` : ''}
        <div class="dre-title"><h1>Dreamers / Engineers</h1><span>Universities & ecosystems to explore</span></div>
      </header>
      <div class="dre-grid">
        ${dreamersHtml}
      </div>
      <footer class="foot"><p>CityBreaker</p><p>${pageCounter}</p></footer>
    </section>
  `;

  const styles = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
    :root {
      --serif: 'Playfair Display', serif;
      --sans: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, sans-serif;
      --brand: #E6C670;
      --bg: #181818;
      --text: #EAEAEA;
      --muted: #A0A0A0;
      --card: #232323;
      --line: #3a3a3a;
    }
    html, body { margin:0; padding:0; background:#000; }
    body { font-family: var(--sans); color: var(--text); -webkit-print-color-adjust: exact; }
    .page { width: 210mm; height: 297mm; box-sizing: border-box; page-break-after: always; position: relative; display:flex; flex-direction: column; overflow: hidden; background: var(--bg); }
    .page:last-child { page-break-after: auto; }

    /* Cover */
    .cover-page { background-size: cover; background-position: center; justify-content: space-between; color:#fff; }
    .cover-content { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 18mm 14mm 6mm; text-align:center; }
    .cover-logo { width: 120px; height:120px; margin-bottom: 16px; filter: invert(1) brightness(1.2); }
    .cover-title { font-family: var(--serif); font-size: 64px; letter-spacing: .5px; margin: 0; text-shadow: 2px 2px 10px rgba(0,0,0,.6); }
    .cover-tagline { font-size: 15px; letter-spacing: 2px; text-transform: uppercase; margin: 8px 0 0; color: #f0f0f0; opacity: .95; }
    .cover-guide-container { display:grid; grid-template-columns: 1fr; gap: 12px; padding: 14mm; margin: 6mm 10mm 16mm; background: rgba(24,24,24,.88); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; }
    .guide-col h3 { font-family: var(--serif); color: var(--brand); font-size: 16px; margin:0 0 6px; }
    .guide-col p { font-size: 12.5px; line-height: 1.55; margin:0; color: var(--text); }

    /* Itinerary pages */
    .it-page { padding: 12mm; }
    .head { display:flex; align-items:center; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    .logo-small { width: 44px; height:44px; margin-right: 12px; filter: invert(1) brightness(1.2); }
    .head-text h1 { font-family: var(--serif); font-size: 26px; margin:0; }
    .head-text span { font-size: 12px; color: var(--muted); }

    .day-title { text-align:center; margin: 10mm 0 7mm; }
    .day-title h2 { font-size: 13px; color: var(--brand); letter-spacing: 2px; margin:0; text-transform: uppercase; }
    .day-title h1 { font-family: var(--serif); font-size: 28px; margin: 4px 0 0; }
    .day-title.placeholder { height: 22mm; }

    .acts { display:flex; flex-direction: column; gap: 8mm; }
    .activity { display:flex; gap: 8mm; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    .image { width: 38%; min-height: 72mm; background: #2b2b2b; }
    .image img { width:100%; height:100%; object-fit: cover; display:block; }
    .no-image { width:100%; height:100%; background: #2f2f2f; }
    .content { flex:1; padding: 10mm 10mm 9mm 0; display:flex; flex-direction: column; }
    .meta { display:flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .pill { font-size: 11px; color: #111; background: var(--brand); padding: 4px 8px; border-radius: 100px; font-weight: 600; }
    .content h3 { font-family: var(--serif); font-size: 18px; margin: 2px 0 6px; }
    .desc { font-size: 12.5px; line-height: 1.55; margin: 0 0 8px; color: var(--text); }
    .kv { display:grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin: 4px 0 8px; }
    .kv label { display:block; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .kv p { font-size: 12.5px; line-height: 1.5; margin:0; }
    .links a { font-size: 12px; color: var(--brand); text-decoration: none; margin-right: 10px; }

    .foot { position:absolute; bottom: 8mm; left: 12mm; right:12mm; display:flex; justify-content: space-between; font-size: 10px; color: var(--muted); }

    /* Dreamers / Engineers */
    .dre-page { padding: 14mm; }
    .dre-head { display:flex; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px; }
    .dre-title h1 { font-family: var(--serif); font-size: 26px; margin:0; }
    .dre-title span { font-size: 12px; color: var(--muted); }
    .dre-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 10mm; }
    .dre-card { background: var(--card); border:1px solid var(--line); border-radius: 10px; padding: 8mm; }
    .dre-card h3 { font-family: var(--serif); font-size: 18px; margin:0 0 4px; }
    .dre-card .area { font-weight: 600; color: var(--brand); font-size: 14px; }
    .dre-note { font-size: 12.5px; line-height: 1.55; color: var(--text); margin: 4px 0 8px; }
    .dre-link a { color: var(--brand); font-size: 12.5px; text-decoration: none; word-break: break-word; }

    /* Mobile-ish scale (helps on iPad/phones that display the PDF) */
    @media screen and (max-width: 900px) {
      .page { width: 100vw; height: auto; min-height: 100vh; }
      .image { min-height: 48vw; }
      .dre-grid { grid-template-columns: 1fr; }
    }
  </style>`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${city} – CityBreaker Guide</title>
      ${styles}
    </head>
    <body>
      ${coverPageHtml}
      ${itineraryHtml}
      ${dreamersPage}
    </body>
  </html>`;
}

/* ==============================
 * PDF rendering (puppeteer-core + @sparticuz/chromium)
 * ============================== */
async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,        
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfRaw = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });

    return Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
  } finally {
    await browser.close();
  }
}

/* ==============================
 * Route handler
 * ============================== */
export async function POST(req: NextRequest) {
  try {
    const { places = [], tripLength = 3, cityName = 'CityBreaker', sessionId } = await req.json();
    if (!Array.isArray(places) || !places.length) {
      return NextResponse.json({ error: 'Missing places' }, { status: 400 });
    }
    const city = cityName.trim();
    const days = Math.min(Math.max(tripLength, 1), 7);

    // final-PDF cache (by city+days)
    const pdfCacheKey = `pdf:${slug(city)}:${days}`;
    const cachedUrl = getCache(pdfCache, pdfCacheKey);
    if (cachedUrl) {
      return NextResponse.json({ url: cachedUrl });
    }

    // secrets
    if (!mapsKey) mapsKey = await getSecret(MAPS_SECRET);

    // data & AI
    const enriched = await enrichPlaces(places, mapsKey, city);
    if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
    const [guide, itinerary] = await Promise.all([
      generateCityGuideJson(city, enriched),
      generateItineraryJson(enriched, days, city),
    ]);

    // html + pdf
    const html = await buildHtml(guide, itinerary, enriched, city);
    const pdf  = await generatePdf(html);
    const filename = createFilename(city, days);

    // if sessionId present: upload to Cloud Storage & return signed URL (cached)
    if (sessionId) {
      const file = storage.bucket(BUCKET_NAME).file(`sessions/${sessionId}/${filename}`);
      await file.save(pdf, { contentType: 'application/pdf' });
      const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
      setCache(pdfCache, pdfCacheKey, url, PDF_CACHE_TTL_MS);
      return NextResponse.json({ url });
    }

    // else: return raw PDF
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error during PDF generation.';
    console.error('PDF route error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
