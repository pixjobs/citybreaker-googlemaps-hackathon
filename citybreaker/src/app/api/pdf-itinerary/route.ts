export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const GEMINI_SECRET = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET = 'projects/934477100130/secrets/maps-api-key/versions/latest';
const BUCKET_NAME = 'citybreaker-downloads';
const GEMINI_MODEL = 'gemini-2.5-pro';
const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';

// --- Caching & Clients ---
const storage = new Storage();
const smClient = new SecretManagerServiceClient();
let geminiKey: string | null = null;
let mapsKey: string | null = null;

// --- Helper Functions ---
async function getSecret(name: string): Promise<string> {
  const [version] = await smClient.accessSecretVersion({ name });
  return version.payload?.data?.toString() || '';
}

function createFilename(city: string, days: number): string {
  return `${city.replace(/\s+/g, '_')}_${days}d_Itinerary.pdf`;
}

// --- Data Enrichment ---
async function enrichPlacesWithPhotos(places: { name: string }[], apiKey: string): Promise<{ name: string; photoUrl?: string }[]> {
  return Promise.all(
    places.map(async ({ name }) => {
      if (!name) return { name: 'Unnamed Place' };
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
      } catch (error) {
        console.error(`Failed to enrich place: ${name}`, error);
        return { name };
      }
    })
  );
}

// --- Itinerary Generation ---
async function generateMarkdown(places: { name: string }[], days: number, city: string): Promise<string> {
  if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
  const client = new GoogleGenerativeAI(geminiKey);
  const model = client.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = `
    Create a detailed, engaging, and well-structured ${days}-day markdown itinerary for a trip to ${city}.
    For each day, provide a clear heading starting with '### Day N: [Creative Title]'.
    Within each day, create a list of 2-4 activities.
    For each activity, provide a short, enticing description (1-2 sentences).
    Make sure to naturally incorporate the following places into the itinerary:
    ${places.map(p => `- ${p.name}`).join('\n')}
    The tone should be exciting and inspiring. Ensure the output is valid markdown.
    `;
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// --- HTML Builder ---
function buildHtml(markdown: string, city: string): string {
    const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');
    let logoBase64 = '';
    try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    } catch {
        console.error("Logo file not found. PDF will be generated without a logo.");
    }
    const dayBlocks = markdown.split('###').slice(1);
    let contentHtml = '';
    dayBlocks.forEach((block, index) => {
        const lines = block.trim().split('\n');
        const heading = lines.shift()?.trim() || `Day ${index + 1}`;
        const activities = lines
            .map(line => line.replace(/^[-*]\s*/, '').trim())
            .filter(Boolean)
            .map(line => {
                const parts = line.split('**');
                return parts.length > 2 ? `<li><strong>${parts[1]}</strong>: ${parts[2].trim()}</li>` : `<li>${line}</li>`;
            })
            .join('');
        contentHtml += `
            <div class="day-section">
                <div class="day-number">Day ${index + 1}</div>
                <h2 class="day-title">${heading.replace(/^Day \d+:\s*/, '')}</h2>
                <ul class="itinerary-list">${activities}</ul>
            </div>
        `;
    });
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8"><title>${city} Itinerary</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Roboto+Slab:wght@700&display=swap');
            body { font-family: 'Roboto', sans-serif; margin: 0; color: #333; background-color: #fff; -webkit-print-color-adjust: exact; }
            .page { padding: 40px; box-sizing: border-box; page-break-after: always; position: relative; min-height: 29.7cm; }
            .page:last-child { page-break-after: auto; }
            .header { display: flex; align-items: center; padding-bottom: 20px; border-bottom: 2px solid #e0e0e0; }
            .logo { width: 50px; height: 50px; margin-right: 20px; }
            .main-title { font-family: 'Roboto Slab', serif; font-size: 28px; font-weight: 700; color: #1a1a1a; }
            .main-title span { font-size: 20px; font-weight: 400; color: #666; }
            .day-section { margin-top: 30px; border: 1px solid #eee; border-radius: 8px; padding: 20px; background-color: #f9f9f9; }
            .day-number { font-family: 'Roboto Slab', serif; font-size: 14px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }
            .day-title { font-family: 'Roboto Slab', serif; font-size: 22px; color: #333; margin: 5px 0 15px 0; }
            .itinerary-list { padding-left: 20px; list-style-type: '✔ '; }
            .itinerary-list li { margin-bottom: 12px; line-height: 1.6; }
            .itinerary-list li strong { color: #1a1a1a; }
            .footer { position: absolute; bottom: 20px; left: 40px; right: 40px; text-align: center; font-size: 10px; color: #aaa; }
        </style>
    </head>
    <body>
        <div class="page">
            <div class="header">
                ${logoBase64 ? `<img src="${logoBase64}" class="logo">` : ''}
                <h1 class="main-title">${city} <br><span>Your Personal Itinerary</span></h1>
            </div>
            ${contentHtml}
            <div class="footer">Generated by CityBreaker</div>
        </div>
    </body>
    </html>`;
}

// --- PDF Generation ---
async function generatePdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfData = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });
    await browser.close();
    // --- FIX: Explicitly convert the Uint8Array from puppeteer to a Node.js Buffer ---
    // This satisfies the function's return type `Promise<Buffer>` and resolves the error.
    return Buffer.from(pdfData);
}

// --- Route Handler ---
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
    const html = buildHtml(markdown, city);
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

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred.';
    console.error('PDF route error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}