export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import puppeteer from 'puppeteer';

// --- Config ---
const GEMINI_SECRET_NAME = 'projects/934477100130/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET_NAME = 'projects/934477100130/secrets/maps-api-key/versions/latest';
const MAPS_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const MAPS_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const MAPS_PHOTO_BASE_URL = 'https://maps.googleapis.com/maps/api/place/photo';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// --- Types ---
interface IncomingPlace { name: string }
interface EnrichedPlace { name: string; photoUrl?: string }
interface ItineraryDay {
  title: string;
  activities: string[];
  dayPhoto?: string;
}

// --- Caching ---
let cachedGeminiKey: string | null = null;
let cachedMapsKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let secretManagerClient: SecretManagerServiceClient | null = null;

// --- Secret Access ---
async function getSecretManagerClient(): Promise<SecretManagerServiceClient> {
  if (!secretManagerClient) secretManagerClient = new SecretManagerServiceClient();
  return secretManagerClient;
}

async function getSecret(secretName: string): Promise<string | null> {
  try {
    const sm = await getSecretManagerClient();
    const [version] = await sm.accessSecretVersion({ name: secretName });
    return version.payload?.data?.toString() ?? null;
  } catch (error) {
    console.error(`Error accessing secret: ${secretName}`, error);
    return null;
  }
}

// --- Place Enrichment ---
async function enrichPlacesWithPhotos(places: IncomingPlace[], apiKey: string | null): Promise<EnrichedPlace[]> {
  if (!apiKey) return places.map(p => ({ name: p.name }));

  return Promise.all(places.map(async ({ name }) => {
    if (!name) return { name: 'Unnamed Place' };
    try {
      const searchRes = await fetch(`${MAPS_TEXT_SEARCH_URL}?query=${encodeURIComponent(name)}&key=${apiKey}`);
      const searchData = await searchRes.json();
      const placeId = searchData.results?.[0]?.place_id;
      if (!placeId) return { name };

      const detailsRes = await fetch(`${MAPS_DETAILS_URL}?place_id=${placeId}&fields=photos&key=${apiKey}`);
      const detailsData = await detailsRes.json();
      const ref = detailsData.result?.photos?.[0]?.photo_reference;
      const photoUrl = ref ? `${MAPS_PHOTO_BASE_URL}?maxwidth=800&photo_reference=${ref}&key=${apiKey}` : undefined;

      return { name, photoUrl };
    } catch (err) {
      console.error(`Error enriching place "${name}"`, err);
      return { name };
    }
  }));
}

// --- Markdown Parsing ---
function parseItineraryMarkdown(markdown: string, enriched: EnrichedPlace[]): ItineraryDay[] {
  return markdown.split('###').slice(1).map(block => {
    const lines = block.trim().split('\n');
    const heading = lines.shift() ?? '';
    const photoMatch = heading.match(/\[PHOTO_SUGGESTION:\s*"([^"]+)"\]/i);
    const title = heading.replace(/\[PHOTO_SUGGESTION:[^\]]+\]/i, '').trim();
    const photoName = photoMatch?.[1]?.toLowerCase();
    const dayPhoto = enriched.find(p => p.name.toLowerCase() === photoName)?.photoUrl;

    const activities = lines.map(line => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
    return { title, activities, dayPhoto };
  });
}

// --- Gemini Generation ---
async function generateItineraryMarkdown(geminiKey: string, places: EnrichedPlace[], days: number, city: string): Promise<string> {
  if (!cachedGeminiClient) cachedGeminiClient = new GoogleGenerativeAI(geminiKey);
  const model = cachedGeminiClient.getGenerativeModel({ model: GEMINI_MODEL });

  const placeList = places.map(p => `- ${p.name}`).join('\n');
  const prompt = `Generate a ${days}-day Markdown itinerary for ${city}.
Each day starts with: ### Day N: Title [PHOTO_SUGGESTION: "Place Name"]
Use 2–4 of the following places:\n${placeList}
Respond in valid Markdown.`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 },
  });

  const markdown = await result.response.text();
  if (!markdown) throw new Error("Empty response from Gemini.");
  return markdown;
}

// --- HTML to PDF ---
function buildHtml(itinerary: ItineraryDay[], city: string): string {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background: white; }
          h1 { font-size: 28px; margin-bottom: 20px; }
          h2 { font-size: 22px; margin-top: 30px; }
          ul { padding-left: 20px; }
          img { margin: 10px 0; max-width: 100%; height: auto; border-radius: 6px; }
          .day { page-break-after: always; }
          .day:last-child { page-break-after: auto; }
        </style>
      </head>
      <body>
        <h1>${city} Travel Itinerary</h1>
        ${itinerary.map((day, i) => `
          <div class="day">
            <h2>Day ${i + 1}: ${day.title}</h2>
            ${day.dayPhoto ? `<img src="${day.dayPhoto}" alt="Photo for ${day.title}" />` : ''}
            <ul>${day.activities.map(act => `<li>${act}</li>`).join('')}</ul>
          </div>
        `).join('')}
      </body>
    </html>
  `;
}

async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return pdf;
}

// --- Route Handler ---
export async function POST(req: NextRequest) {
  try {
    const { places = [], tripLength = 3, cityName = 'CityBreaker' } = await req.json();

    if (!Array.isArray(places) || places.length === 0) {
      return NextResponse.json({ error: 'Missing or empty places array' }, { status: 400 });
    }

    const city = cityName.trim();
    const days = Math.min(Math.max(tripLength, 1), 7);

    const geminiKey = cachedGeminiKey || await getSecret(GEMINI_SECRET_NAME);
    const mapsKey = cachedMapsKey || await getSecret(MAPS_SECRET_NAME);
    if (!geminiKey) return NextResponse.json({ error: 'Missing Gemini API key' }, { status: 500 });

    cachedGeminiKey = geminiKey;
    cachedMapsKey = mapsKey;

    const enriched = await enrichPlacesWithPhotos(places, mapsKey);
    const markdown = await generateItineraryMarkdown(geminiKey, enriched, days, city);
    const itinerary = parseItineraryMarkdown(markdown, enriched);
    const html = buildHtml(itinerary, city);
    const pdf = await generatePdf(html);

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${city.replace(/\s+/g, '_')}_itinerary.pdf"`
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('PDF itinerary error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
