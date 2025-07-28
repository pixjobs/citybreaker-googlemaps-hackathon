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

// --- UPGRADE: New, richer type definitions ---
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
  priceRange: string; // NEW: e.g., "Free", "$", "$$", "$$$"
  audience: string;   // NEW: e.g., "Families", "Couples", "Solo"
}

interface ItineraryDay {
  title: string;
  activities: ItineraryActivity[];
}

// NEW: Type definition for the city guide content
interface CityGuide {
    airportTransport: { title: string; content: string };
    publicTransport: { title: string; content: string };
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
  // (No changes to this function)
  return Promise.all(
    places.map(async ({ name }) => {
      if (!name) return { name: 'Unnamed Place' };
      try {
        const searchQuery = `${name} ${city}`;
        const searchRes = await fetch(`${TEXT_SEARCH_URL}?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`);
        const searchData = await searchRes.json();
        const placeId = searchData?.results?.[0]?.place_id;
        if (!placeId) return { name };

        const detailsRes = await fetch(`${DETAILS_URL}?place_id=${placeId}&fields=photos,website&key=${apiKey}`);
        const detailsData = await detailsRes.json();
        const result = detailsData?.result;
        const ref = result?.photos?.[0]?.photo_reference;
        
        const photoUrl = ref ? `${PHOTO_URL}?maxwidth=800&photo_reference=${ref}&key=${apiKey}` : undefined;
        const tripAdvisorUrl = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(searchQuery)}`;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}&query_place_id=${placeId}`;

        return { name, photoUrl, website: result?.website, tripAdvisorUrl, googleMapsUrl };
      } catch (error) {
        console.error(`Failed to enrich place: ${name}`, error);
        return { name };
      }
    })
  );
}

// --- UPGRADE: Itinerary Generation now requests price and audience ---
async function generateItineraryJson(places: EnrichedPlace[], days: number, city: string): Promise<ItineraryDay[]> {
  if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
  const client = new GoogleGenerativeAI(geminiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" }
  });

  const placeList = places.map(p => `"${p.name}"`).join(', ');
  const prompt = `
    You are a world-class travel concierge creating a premium itinerary for ${city}.
    Generate a valid JSON object with a single key "itinerary", which is an array of day objects for a ${days}-day trip.
    Each day object must have "title" (creative and inspiring) and "activities" (an array of 2-3 activity objects).
    Each activity object must have SIX keys:
    1. "title": The official name of the place.
    2. "description": An engaging paragraph about the experience.
    3. "whyVisit": A compelling sentence on why this place is a must-see.
    4. "insiderTip": A short, exclusive tip.
    5. "placeName": The exact name from this list: [${placeList}].
    6. "priceRange": A string indicating cost: "Free", "$" (budget), "$$" (mid-range), or "$$$" (expensive).
    7. "audience": A short string for the ideal audience: "Families", "Couples", "Solo", "History Buffs", "Art Lovers", etc.
    The tone must be sophisticated, luxurious, and inspiring.
    `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  try {
    const data = JSON.parse(responseText);
    return data.itinerary || [];
  } catch (e) {
    console.error("Failed to parse Gemini JSON for itinerary:", responseText, "\nError:", e);
    throw new Error("Could not generate a valid itinerary structure.");
  }
}

// --- NEW: Generate content for the City Guide first page ---
async function generateCityGuideJson(city: string): Promise<CityGuide> {
    if (!geminiKey) geminiKey = await getSecret(GEMINI_SECRET);
    const client = new GoogleGenerativeAI(geminiKey);
    const model = client.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
    You are a professional travel guide writer. For the city of ${city}, create a concise, smart, and professional city guide.
    Generate a response as a valid JSON object with a single key "guide".
    The "guide" object must have exactly three keys: "airportTransport", "publicTransport", and "proTips".
    Each key must have an object as its value, containing two strings: "title" and "content".
    - For "airportTransport", the title should be "Arrival & Airport Transit" and the content a professional summary of the best ways to get from the main airport(s) to the city center (e.g., train, bus, taxi, ride-sharing).
    - For "publicTransport", the title should be "Navigating The City" and the content a summary of the public transport system (metro, trams, buses), including how to buy tickets.
    - For "proTips", the title should be "Insider Knowledge" and the content a few smart, high-level tips for a visitor (e.g., a local custom, best time to visit museums, a useful app).
    The content for each section should be a single paragraph of about 50-70 words.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    try {
        const data = JSON.parse(responseText);
        return data.guide;
    } catch (e) {
        console.error("Failed to parse Gemini JSON for city guide:", responseText, "\nError:", e);
        // Provide a fallback structure
        return {
            airportTransport: { title: "Arrival & Airport Transit", content: "Information currently unavailable." },
            publicTransport: { title: "Navigating The City", content: "Information currently unavailable." },
            proTips: { title: "Insider Knowledge", content: "Information currently unavailable." }
        };
    }
}


// --- UPGRADE: Completely new HTML builder for a premium guide ---
function buildHtml(guide: CityGuide, itinerary: ItineraryDay[], enrichedPlaces: EnrichedPlace[], city: string): string {
    const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');
    let logoBase64 = '';
    try {
        logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
    } catch { console.error("Logo file not found."); }

    // NEW: SVG Icons embedded for reliability
    const ICONS = {
        money: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11.8 10.9C11.4 11.2 11 11.4 11 12.3V13H13V12.3C13 11.4 12.6 11.2 12.2 10.9L11.8 10.9ZM12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2ZM12 20C7.6 20 4 16.4 4 12S7.6 4 12 4S20 7.6 20 12 16.4 20 12 20ZM12 6C9.8 6 8 7.8 8 10C8 11.5 8.9 12.7 10.2 13.4L10.5 13.6C11.2 14 11.5 14.4 11.5 15.1V16H12.5V15.1C12.5 14.4 12.8 14 13.5 13.6L13.8 13.4C15.1 12.7 16 11.5 16 10C16 7.8 14.2 6 12 6Z"></path></svg>`,
        audience: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 12.25C13.49 12.25 14.75 11 14.75 9.5C14.75 8 13.49 6.75 12 6.75C10.51 6.75 9.25 8 9.25 9.5C9.25 11 10.51 12.25 12 12.25ZM12 14.25C9.33 14.25 4 15.58 4 18.25V20H20V18.25C20 15.58 14.67 14.25 12 14.25Z"></path></svg>`
    };

    // --- NEW: First Page - City Guide ---
    const cityGuideHtml = `
        <div class="page">
            <div class="header">
                ${logoBase64 ? `<img src="${logoBase64}" class="logo">` : ''}
                <div class="header-text">
                    <h1>${city}</h1>
                    <span>An Essential City Guide</span>
                </div>
            </div>
            <div class="guide-container">
                <div class="guide-column">
                    <h3>${guide.airportTransport.title}</h3>
                    <p>${guide.airportTransport.content}</p>
                </div>
                <div class="guide-column">
                    <h3>${guide.publicTransport.title}</h3>
                    <p>${guide.publicTransport.content}</p>
                </div>
                <div class="guide-column">
                    <h3>${guide.proTips.title}</h3>
                    <p>${guide.proTips.content}</p>
                </div>
            </div>
            <div class="guide-intro">
                <h2>Your Curated Itinerary</h2>
                <p>The following pages contain your personalized travel plan, designed by CityBreaker to help you discover the very best of ${city}. Each day is crafted to be a unique experience, blending iconic sights with local secrets.</p>
            </div>
            <div class="footer">
                <p>Your exclusive guide by CityBreaker</p>
                <p>City Guide</p>
            </div>
        </div>
    `;

    // --- Itinerary Pages ---
    let itineraryHtml = '';
    itinerary.forEach((day, index) => {
        const activitiesHtml = day.activities.map(activity => {
            const place = enrichedPlaces.find(p => p.name === activity.placeName);
            const linksHtml = `
                <div class="links">
                    ${place?.website ? `<a href="${place.website}">Official Website</a>` : ''}
                    ${place?.tripAdvisorUrl ? `<a href="${place.tripAdvisorUrl}">TripAdvisor</a>` : ''}
                    ${place?.googleMapsUrl ? `<a href="${place.googleMapsUrl}">View on Map</a>` : ''}
                </div>`;
            
            // NEW: Info bar with icons
            const infoBarHtml = `
                <div class="info-bar">
                    <span class="info-item">${ICONS.money} ${activity.priceRange}</span>
                    <span class="info-item">${ICONS.audience} ${activity.audience}</span>
                </div>
            `;

            return `
                <div class="activity">
                    <div class="image-container">
                        ${place?.photoUrl ? `<img src="${place.photoUrl}" alt="${activity.title}">` : '<div class="no-image"></div>'}
                    </div>
                    <div class="activity-content">
                        ${infoBarHtml}
                        <h3>${activity.title}</h3>
                        <p class="description">${activity.description}</p>
                        <div class="details-grid">
                            <div class="detail-item">
                                <h4>Why Visit</h4>
                                <p>${activity.whyVisit}</p>
                            </div>
                            <div class="detail-item">
                                <h4>Insider Tip</h4>
                                <p>${activity.insiderTip}</p>
                            </div>
                        </div>
                        ${linksHtml}
                    </div>
                </div>
            `;
        }).join('');

        itineraryHtml += `
            <div class="page">
                <div class="header">
                    ${logoBase64 ? `<img src="${logoBase64}" class="logo">` : ''}
                    <div class="header-text">
                        <h1>${city}</h1>
                        <span>A Curated Itinerary</span>
                    </div>
                </div>
                <div class="day-title-container">
                    <h2>Day ${index + 1} — ${day.title}</h2>
                </div>
                <div class="activities-container">
                    ${activitiesHtml}
                </div>
                <div class="footer">
                    <p>Your exclusive guide by CityBreaker</p>
                    <p>Page ${index + 2}</p>
                </div>
            </div>
        `;
    });

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8"><title>${city} Itinerary</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto+Serif:opsz,wght@8..144,400;8..144,700&family=Raleway:wght@400;500;700&display=swap');
            
            :root {
                --primary-color: #E6C670;
                --background-color: #181818;
                --text-color: #EAEAEA;
                --text-muted-color: #999;
                --card-background-color: #242424;
                --border-color: #383838;
            }
            body { 
                font-family: 'Raleway', sans-serif; 
                margin: 0; 
                background-color: var(--background-color); 
                color: var(--text-color); 
                -webkit-print-color-adjust: exact;
            }
            .page { 
                display: flex; 
                flex-direction: column; 
                width: 210mm; 
                min-height: 297mm;
                box-sizing: border-box; 
                padding: 15mm; 
                page-break-after: always;
                position: relative; 
            }
            .page:last-child { page-break-after: auto; }
            .header { display: flex; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; }
            .logo { width: 55px; height: 55px; margin-right: 20px; filter: invert(1) brightness(1.5); }
            .header-text h1 { font-family: 'Roboto Serif', serif; font-size: 34px; margin: 0; color: white; }
            .header-text span { font-size: 14px; color: var(--text-muted-color); letter-spacing: 1px; }
            
            /* --- NEW: City Guide Page Styles --- */
            .guide-container { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin: 25px 0; flex-grow: 1; }
            .guide-column { padding: 0 10px; border-left: 1px solid var(--border-color); }
            .guide-column:first-child { border-left: none; padding-left: 0; }
            .guide-column:last-child { padding-right: 0; }
            .guide-column h3 { font-family: 'Roboto Serif', serif; color: var(--primary-color); font-size: 18px; margin: 0 0 10px 0; }
            .guide-column p { font-size: 13px; line-height: 1.7; margin: 0; }
            .guide-intro { text-align: center; padding: 20px; border-top: 1px solid var(--border-color); }
            .guide-intro h2 { font-family: 'Roboto Serif', serif; font-size: 22px; margin: 0 0 10px 0; }
            .guide-intro p { font-size: 14px; line-height: 1.6; max-width: 80%; margin: 0 auto; color: var(--text-muted-color); }

            /* --- Itinerary Page Styles --- */
            .day-title-container { text-align: center; margin: 25px 0; }
            .day-title-container h2 { font-family: 'Roboto Serif', serif; font-size: 26px; font-weight: 400; margin: 0; color: white; }
            .activities-container { flex-grow: 1; }
            
            /* --- UPGRADE: Lonely Planet Style Activity Card --- */
            .activity { 
                margin-bottom: 15mm; 
                background-color: var(--card-background-color); 
                border-radius: 8px; 
                overflow: hidden; 
                border: 1px solid var(--border-color); 
                display: flex; /* Key change for horizontal layout */
                flex-direction: row;
                page-break-inside: avoid;
                min-height: 240px; /* Ensure consistent height */
            }
            .image-container { 
                width: 35%; /* Image takes left part */
                flex-shrink: 0;
            }
            .image-container img { width: 100%; height: 100%; object-fit: cover; }
            .no-image { width: 100%; height: 100%; background-color: var(--border-color); }
            .activity-content { 
                padding: 20px; 
                flex-grow: 1; /* Content takes remaining space */
                display: flex; 
                flex-direction: column; 
            }
            .activity-content h3 { font-family: 'Roboto Serif', serif; font-size: 20px; margin: 0 0 12px 0; color: var(--primary-color); }
            .activity-content p.description { font-size: 13px; line-height: 1.6; margin: 0 0 15px 0; flex-grow: 1; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
            .detail-item h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted-color); margin: 0 0 5px 0; }
            .detail-item p { font-size: 12px; line-height: 1.6; margin: 0; }
            .links { display: flex; gap: 15px; border-top: 1px solid var(--border-color); padding-top: 15px; margin-top: auto; }
            .links a { font-size: 12px; color: var(--primary-color); text-decoration: none; font-weight: 500; }
            
            /* --- NEW: Info Bar with Icons --- */
            .info-bar { display: flex; gap: 20px; margin-bottom: 15px; color: var(--text-muted-color); }
            .info-item { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; }
            .info-item svg { fill: var(--text-muted-color); }

            .footer { position: absolute; bottom: 10mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted-color); }
        </style>
    </head>
    <body>${cityGuideHtml}${itineraryHtml}</body>
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
    
    // Execute all data generation in parallel for efficiency
    const [enriched, guide, itinerary] = await Promise.all([
        enrichPlaces(places, mapsKey, city),
        generateCityGuideJson(city),
        generateItineraryJson(places, days, city) // Note: `places` is passed here for the prompt
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