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
const MAPS_SECRET = 'projects/934477100130/secrets/places-api-key/versions/latest';
const BUCKET_NAME = 'citybreaker-downloads';
const GEMINI_MODEL = 'gemini-2.5-pro';

const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_PHOTO_BASE_URL = 'https://places.googleapis.com/v1';

// --- Caching & Clients ---
const storage = new Storage();
const smClient = new SecretManagerServiceClient();
let geminiKey: string | null = null;
let mapsKey: string | null = null;

// --- Type Definitions ---
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
    publicTransport: { title:string; content: string };
    proTips: { title: string; content: string };
}

// --- Helper Functions ---
async function getSecret(name: string): Promise<string> {
  const [version] = await smClient.accessSecretVersion({ name });
  return version.payload?.data?.toString() || '';
}

function createFilename(city: string, days: number): string {
  return `${city.replace(/\s+/g, '_')}_${days}d_Guide.pdf`;
}

// --- Data Enrichment ---
async function enrichPlaces(places: { name: string }[], apiKey: string, city: string): Promise<EnrichedPlace[]> {
  return Promise.all(
    places.map(async ({ name }) => {
      const originalName = name?.trim();
      if (!originalName) return { name: 'Unnamed Place' };
      
      try {
        const searchQuery = `${originalName} in ${city}`;
        const requestBody = { textQuery: searchQuery };
        const requestHeaders = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.photos',
        };
        
        const searchRes = await fetch(PLACES_SEARCH_TEXT_URL, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
        });

        if (!searchRes.ok) {
            const errorText = await searchRes.text();
            throw new Error(`Places API v1 error: ${searchRes.status} - ${errorText}`);
        }

        const searchData = await searchRes.json();
        const firstResult = searchData.places?.[0];

        if (!firstResult) {
            console.warn(`No results for "${searchQuery}" from Places API v1.`);
            return { name: originalName };
        }
        
        const photoName = firstResult.photos?.[0]?.name;
        const photoUrl = photoName 
            ? `${PLACES_PHOTO_BASE_URL}/${photoName}/media?key=${apiKey}&maxHeightPx=1200` 
            : undefined;

        const tripAdvisorUrl = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(searchQuery)}`;

        return {
          name: firstResult.displayName?.text || originalName,
          photoUrl,
          website: firstResult.websiteUri,
          googleMapsUrl: firstResult.googleMapsUri,
          tripAdvisorUrl,
        };

      } catch (error) {
        console.error(`Failed to enrich place: ${originalName}`, error);
        return { name: originalName };
      }
    })
  );
}

// --- FINAL Itinerary Generation with CONCISE Text ---
async function generateItineraryJson(places: EnrichedPlace[], days: number, city: string): Promise<ItineraryDay[]> {
  if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
  const client = new GoogleGenerativeAI(geminiKey);
  const model = client.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: { responseMimeType: "application/json" } });

  const placeList = places.map(p => `"${p.name}"`).join(', ');
  const prompt = `
    You are a world-class travel concierge creating a premium, concise itinerary for ${city}.
    Generate a valid JSON object with a single key "itinerary", an array of day objects for a ${days}-day trip.
    Each day object must have "title" (creative) and "activities" (an array of 2 activity objects).
    Each activity object must have "title", "placeName" (from this list: [${placeList}]), "priceRange" ("Free", "$", "$$", or "$$$"), "audience" ("Families", "Couples", etc.), and the following VERY CONCISE text fields:
    - "description": A concise and engaging 25 word paragraph.
    - "whyVisit": A single, compelling sentence, maximum 10 words.
    - "insiderTip": A very short, exclusive tip, maximum 10 words.
    The tone must be sophisticated and inspiring.
    `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  try {
    return JSON.parse(responseText).itinerary || [];
  } catch (e) {
    console.error("Failed to parse Gemini JSON for itinerary:", responseText, "\nError:", e);
    throw new Error("Could not generate a valid itinerary structure.");
  }
}

// --- City Guide Generation ---
async function generateCityGuideJson(city: string, places: EnrichedPlace[]): Promise<CityGuide> {
    if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
    const client = new GoogleGenerativeAI(geminiKey);
    const model = client.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: { responseMimeType: "application/json" } });
    
    const placeNames = places.map(p => p.name).join(', ');

    const prompt = `You are a professional travel guide writer for a luxury magazine. For the city of ${city}, create a concise, smart, and professional city guide. Generate a response as a valid JSON object with a single key "guide". The "guide" object must have FOUR keys: "tagline", "coverPhotoSuggestion", "airportTransport", "publicTransport", and "proTips".
    - "tagline": A short, inspiring tagline for the city (e.g., "Where History Meets Modernity").
    - "coverPhotoSuggestion": From the following list of places, select the ONE name that would make the most iconic and beautiful cover photo for a travel guide about ${city}. List of places: [${placeNames}].
    - "airportTransport": An object with "title" ("Arrival & Airport Transit") and "content" (a professional summary of getting from the airport to the city center).
    - "publicTransport": An object with "title" ("Navigating The City") and "content" (a summary of the public transport system).
    - "proTips": An object with "title" ("Insider Knowledge") and "content" (a few smart, high-level tips).
    The content for each section should be a single paragraph of about 50-70 words.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    try {
        return JSON.parse(responseText).guide;
    } catch (e) {
        console.error("Failed to parse Gemini JSON for city guide:", responseText, "\nError:", e);
        return {
            tagline: "Your Unforgettable Journey",
            coverPhotoSuggestion: places[0]?.name || 'city view',
            airportTransport: { title: "Arrival & Airport Transit", content: "Information currently unavailable." },
            publicTransport: { title: "Navigating The City", content: "Information currently unavailable." },
            proTips: { title: "Insider Knowledge", content: "Information currently unavailable." }
        };
    }
}

// --- FINAL, POLISHED HTML BUILDER with Page Flow Control ---
function buildHtml(guide: CityGuide, itinerary: ItineraryDay[], enrichedPlaces: EnrichedPlace[], city: string): string {
    const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');
    const logoBase64 = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}` : '';

    const coverPlace = enrichedPlaces.find(p => p.name === guide.coverPhotoSuggestion);
    const coverPhotoUrl = coverPlace?.photoUrl || enrichedPlaces.find(p => p.photoUrl)?.photoUrl || '';

    const ICONS = {
        money: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11.8 10.9C11.4 11.2 11 11.4 11 12.3V13H13V12.3C13 11.4 12.6 11.2 12.2 10.9L11.8 10.9ZM12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2ZM12 20C7.6 20 4 16.4 4 12S7.6 4 12 4S20 7.6 20 12 16.4 20 12 20ZM12 6C9.8 6 8 7.8 8 10C8 11.5 8.9 12.7 10.2 13.4L10.5 13.6C11.2 14 11.5 14.4 11.5 15.1V16H12.5V15.1C12.5 14.4 12.8 14 13.5 13.6L13.8 13.4C15.1 12.7 16 11.5 16 10C16 7.8 14.2 6 12 6Z"></path></svg>`,
        audience: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12.25C13.49 12.25 14.75 11 14.75 9.5C14.75 8 13.49 6.75 12 6.75C10.51 6.75 9.25 8 9.25 9.5C9.25 11 10.51 12.25 12 12.25ZM12 14.25C9.33 14.25 4 15.58 4 18.25V20H20V18.25C20 15.58 14.67 14.25 12 14.25Z"></path></svg>`
    };

    const coverPageHtml = `
        <div class="page cover-page" style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.75) 100%), url('${coverPhotoUrl}');">
            <div class="cover-content">
                ${logoBase64 ? `<img src="${logoBase64}" class="cover-logo">` : ''}
                <h1 class="cover-title">${city}</h1>
                <p class="cover-tagline">${guide.tagline}</p>
            </div>
            <div class="cover-guide-container">
                <div class="guide-column"><h3>${guide.airportTransport.title}</h3><p>${guide.airportTransport.content}</p></div>
                <div class="guide-column"><h3>${guide.publicTransport.title}</h3><p>${guide.publicTransport.content}</p></div>
                <div class="guide-column"><h3>${guide.proTips.title}</h3><p>${guide.proTips.content}</p></div>
            </div>
        </div>
    `;

    let itineraryHtml = '';
    let pageCounter = 2; // Starts at 2 because the cover is page 1
    itinerary.forEach((day, dayIndex) => {
        // --- CHUNKING LOGIC: Group activities into pairs for each page ---
        const activityChunks = [];
        for (let i = 0; i < day.activities.length; i += 2) {
            activityChunks.push(day.activities.slice(i, i + 2));
        }

        activityChunks.forEach((chunk, chunkIndex) => {
            const activitiesHtml = chunk.map(activity => {
                const place = enrichedPlaces.find(p => p.name === activity.placeName);
                return `
                    <div class="activity">
                        <div class="image-container">
                            ${place?.photoUrl ? `<img src="${place.photoUrl}" alt="${activity.title}">` : '<div class="no-image"></div>'}
                        </div>
                        <div class="activity-content">
                            <div class="info-bar"><span class="info-item">${ICONS.money} ${activity.priceRange}</span><span class="info-item">${ICONS.audience} ${activity.audience}</span></div>
                            <h3>${activity.title}</h3>
                            <p class="description">${activity.description}</p>
                            <div class="details-grid">
                                <div class="detail-item"><h4>Why Visit</h4><p>${activity.whyVisit}</p></div>
                                <div class="detail-item"><h4>Insider Tip</h4><p>${activity.insiderTip}</p></div>
                            </div>
                            <div class="links">
                                ${place?.website ? `<a href="${place.website}">Official Website</a>` : ''}
                                ${place?.tripAdvisorUrl ? `<a href="${place.tripAdvisorUrl}">TripAdvisor</a>` : ''}
                                ${place?.googleMapsUrl ? `<a href="${place.googleMapsUrl}">View on Map</a>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            itineraryHtml += `
                <div class="page itinerary-page">
                    <div class="header">
                        ${logoBase64 ? `<img src="${logoBase64}" class="logo-small">` : ''}
                        <div class="header-text"><h1>${city}</h1><span>A Curated Itinerary</span></div>
                    </div>
                    ${chunkIndex === 0 ? `
                        <div class="day-title-container">
                            <h2>Day ${dayIndex + 1}</h2>
                            <h1>${day.title}</h1>
                        </div>
                    ` : '<div class="day-title-container-placeholder"></div>' }
                    <div class="activities-container">${activitiesHtml}</div>
                    <div class="footer"><p>Your exclusive guide by CityBreaker</p><p>Page ${pageCounter}</p></div>
                </div>
            `;
            pageCounter++;
        });
    });

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8"><title>${city} Itinerary</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Raleway:wght@400;500;700&display=swap');
            :root {
                --font-serif: 'Playfair Display', serif; --font-sans: 'Raleway', sans-serif;
                --primary-color: #E6C670; --background-color: #181818; --text-color: #EAEAEA;
                --text-muted-color: #A0A0A0; --card-background-color: #242424; --border-color: #383838;
            }
            body { font-family: var(--font-sans); margin: 0; background-color: var(--background-color); color: var(--text-color); -webkit-print-color-adjust: exact; }
            .page { width: 210mm; height: 297mm; box-sizing: border-box; page-break-after: always; position: relative; display: flex; flex-direction: column; overflow: hidden; }
            .page:last-child { page-break-after: auto; }
            .cover-page { background-size: cover; background-position: center; justify-content: space-between; text-align: center; color: white; padding: 0; }
            .cover-content { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20mm; z-index: 2; }
            .cover-logo { width: 150px; height: 150px; margin-bottom: 30px; filter: brightness(0) invert(1); }
            .cover-title { font-family: var(--font-serif); font-size: 84px; font-weight: 700; margin: 0; text-shadow: 3px 3px 12px rgba(0,0,0,0.8); }
            .cover-tagline { font-size: 18px; letter-spacing: 3px; text-transform: uppercase; margin: 10px 0 0 0; text-shadow: 2px 2px 8px rgba(0,0,0,0.8); opacity: 0.95; }
            .cover-guide-container { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 35px; padding: 25px 30px; margin: 15mm 20mm; background-color: rgba(24, 24, 24, 0.88); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 12px; z-index: 2; }
            .guide-column { padding: 0 15px; border-left: 1px solid var(--border-color); text-align: left;}
            .guide-column:first-child { border-left: none; }
            .guide-column h3 { font-family: var(--font-serif); color: var(--primary-color); font-size: 16px; margin: 0 0 10px 0; }
            .guide-column p { font-size: 12px; line-height: 1.6; margin: 0; color: var(--text-muted-color); }
            .itinerary-page { padding: 15mm; }
            .header { display: flex; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; }
            .logo-small { width: 55px; height: 55px; margin-right: 20px; filter: invert(1) brightness(1.5); }
            .header-text h1 { font-family: var(--font-serif); font-size: 34px; margin: 0; color: white; }
            .header-text span { font-size: 14px; color: var(--text-muted-color); letter-spacing: 1px; }
            .day-title-container { text-align: center; margin: 15mm 0; }
            .day-title-container h1 { font-family: var(--font-serif); font-size: 36px; font-weight: 700; margin: 5px 0 0 0; color: white; }
            .day-title-container h2 { font-family: var(--font-sans); font-size: 16px; font-weight: 500; color: var(--primary-color); text-transform: uppercase; letter-spacing: 2px; margin: 0; }
            .day-title-container-placeholder { height: 88px; margin: 15mm 0; } /* Matches height of title container */
            .activities-container { flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 10mm; }
            .activity { background-color: var(--card-background-color); border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); display: flex; flex-direction: row; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .image-container { width: 40%; flex-shrink: 0; }
            .image-container img { width: 100%; height: 100%; object-fit: cover; }
            .no-image { width: 100%; height: 100%; background-color: var(--border-color); }
            .activity-content { padding: 20px; flex-grow: 1; display: flex; flex-direction: column; }
            .activity-content h3 { font-family: var(--font-serif); font-size: 22px; margin: 0 0 10px 0; color: var(--primary-color); }
            .activity-content p.description { font-size: 13px; line-height: 1.6; margin: 0 0 15px 0; flex-grow: 1; color: var(--text-color); }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
            .detail-item h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted-color); margin: 0 0 5px 0; }
            .detail-item p { font-size: 12px; line-height: 1.5; margin: 0; }
            .links { display: flex; gap: 15px; border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: auto; }
            .links a { font-size: 12px; color: var(--primary-color); text-decoration: none; font-weight: 500; }
            .info-bar { display: flex; gap: 20px; margin-bottom: 12px; color: var(--text-muted-color); }
            .info-item { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; }
            .info-item svg { fill: var(--text-muted-color); }
            .footer { position: absolute; bottom: 10mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted-color); z-index: 3;}
        </style>
    </head>
    <body>${coverPageHtml}${itineraryHtml}</body>
    </html>`;
}

// --- PDF Generation ---
async function generatePdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfData = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' } });
    await browser.close();
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
    
    const enriched = await enrichPlaces(places, mapsKey, city);
    
    const [guide, itinerary] = await Promise.all([
        generateCityGuideJson(city, enriched),
        generateItineraryJson(enriched, days, city)
    ]);

    const html = buildHtml(guide, itinerary, enriched, city);
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