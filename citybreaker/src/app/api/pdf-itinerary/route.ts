export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

// Constants
const GEMINI_SECRET = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET = 'projects/934477100130/secrets/maps-api-key/versions/latest';
const BUCKET_NAME = 'citybreaker-downloads';
const GEMINI_MODEL = 'gemini-2.5-flash-lite-preview-06-17';
const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';

// Storage + Paths
const storage = new Storage();
const fontDir = path.join(process.cwd(), 'public', 'fonts');
const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');

// Helper: secrets
let geminiKey: string | null = null;
let mapsKey: string | null = null;
const smClient = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
  const [version] = await smClient.accessSecretVersion({ name });
  return version.payload?.data?.toString() || '';
}

// Helper: filename
function createFilename(city: string, days: number): string {
  return `${city.replace(/\s+/g, '_')}_${days}d_Itinerary.pdf`;
}

// Enrichment: Places + Photos
async function enrichPlacesWithPhotos(places: { name: string }[], apiKey: string): Promise<{ name: string; photoUrl?: string }[]> {
  return Promise.all(
    places.map(async ({ name }) => {
      try {
        const searchRes = await fetch(`${TEXT_SEARCH_URL}?query=${encodeURIComponent(name)}&key=${apiKey}`);
        const searchData = await searchRes.json();
        const placeId = searchData?.results?.[0]?.place_id;

        if (!placeId) return { name };

        const detailsRes = await fetch(`${DETAILS_URL}?place_id=${placeId}&fields=photos&key=${apiKey}`);
        const detailsData = await detailsRes.json();
        const ref = detailsData?.result?.photos?.[0]?.photo_reference;

        const photoUrl = ref ? `${PHOTO_URL}?maxwidth=800&photo_reference=${ref}&key=${apiKey}` : undefined;
        return { name, photoUrl };
      } catch {
        return { name };
      }
    })
  );
}

// Markdown via Gemini
async function generateMarkdown(places: { name: string }[], days: number, city: string): Promise<string> {
  if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
  const client = new GoogleGenerativeAI(geminiKey);
  const model = client.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = `Create a ${days}-day markdown itinerary for ${city}. Each day starts with '### Day N: Title [PHOTO_SUGGESTION: "Place Name"]'. Use these places:\n${places.map(p => '- ' + p.name).join('\n')}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 }
  });

  return result.response.text();
}

// HTML Builder
function buildHtml(markdown: string, places: { name: string; photoUrl?: string }[], days: number, city: string): string {
  const dayBlocks = markdown.split('###').slice(1);
  let content = '';

  for (let i = 0; i < dayBlocks.length; i++) {
    const lines = dayBlocks[i].trim().split('\n');
    const rawHeading = lines.shift() ?? '';
    const heading = rawHeading.replace(/\[.*?\]/, '').trim();
    const photoSuggestion = rawHeading.match(/\[PHOTO_SUGGESTION:\s*"([^"]+)"\]/i)?.[1]?.toLowerCase();
    const image = places.find(p => p.name.toLowerCase() === photoSuggestion)?.photoUrl;

    const imageHtml = image
      ? `<img src="${image}" class="itinerary-image" alt="Photo for ${heading}" />`
      : `<div class="image-placeholder">${photoSuggestion ? `No image for "${photoSuggestion}"` : ''}</div>`;

    const listItems = lines
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .map(l => `<li>${l}</li>`)
      .join('');

    content += `
      <div class="day-section ${i > 0 ? 'page-break' : ''}">
        <h2 class="day-title">Day ${i + 1}: ${heading}</h2>
        ${imageHtml}
        <ul class="itinerary-list">${listItems}</ul>
      </div>`;
  }

  const font = (f: string) => `file://${path.join(fontDir, f).replace(/\\/g, '/')}`;
  const logo = fs.existsSync(logoPath) ? `<img src="file://${logoPath.replace(/\\/g, '/')}" class="logo" alt="Logo">` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @font-face { font-family: 'RobotoSerif'; src: url('${font('RobotoSerif-Regular.ttf')}'); }
    @font-face { font-family: 'RobotoSerif-Bold'; src: url('${font('RobotoSerif-Bold.ttf')}'); font-weight: bold; }
    body { font-family: 'RobotoSerif'; margin: 50px; color: #111; }
    .logo { width: 80px; float: left; margin-right: 20px; }
    .main-title { font-family: 'RobotoSerif-Bold'; font-size: 24px; margin-top: 10px; }
    .day-section { margin-top: 30px; }
    .day-title { font-family: 'RobotoSerif-Bold'; font-size: 18px; text-decoration: underline; }
    .itinerary-image { width: 100%; max-height: 250px; object-fit: cover; margin: 10px 0; }
    .image-placeholder { font-size: 10px; color: #888; font-style: italic; margin: 10px 0; }
    .itinerary-list { padding-left: 20px; }
    .page-break { page-break-before: always; }
  </style></head><body>
    <div class="header">${logo}<h1 class="main-title">${city} – ${days}-Day Itinerary</h1></div>
    ${content}
  </body></html>`;
}

// Generate PDF
async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const buffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return buffer;
}

// Route Handler
export async function POST(req: NextRequest) {
  try {
    const { places = [], tripLength = 3, cityName = 'CityBreaker', sessionId } = await req.json();
    if (!Array.isArray(places) || !places.length) {
      return NextResponse.json({ error: 'Missing places' }, { status: 400 });
    }
    const city = cityName.trim();
    const days = Math.min(Math.max(tripLength, 1), 7);

    if (!mapsKey) mapsKey = await getSecret(MAPS_SECRET);
    const enriched = await enrichPlacesWithPhotos(places, mapsKey);
    const markdown = await generateMarkdown(enriched, days, city);
    const html = buildHtml(markdown, enriched, days, city);
    const pdf = await generatePdf(html);
    const filename = createFilename(city, days);

    if (sessionId) {
      const file = storage.bucket(BUCKET_NAME).file(`sessions/${sessionId}/${filename}`);
      await file.save(pdf, { contentType: 'application/pdf' });
      const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 3600000 });
      return NextResponse.json({ url });
    } else {
      return new NextResponse(pdf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }
  } catch (error: any) {
    console.error('PDF route error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
