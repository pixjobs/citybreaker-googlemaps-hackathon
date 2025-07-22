export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const GEMINI_SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET_NAME = 'projects/845341257082/secrets/maps-api-key/versions/latest';
const MAPS_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const MAPS_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const MAPS_PHOTO_BASE_URL = 'https://maps.googleapis.com/maps/api/place/photo';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const MAX_TRIP_DAYS = 7;
const MIN_TRIP_DAYS = 3;

interface Place {
  name: string;
  photoUrl?: string;
}

interface IncomingPlace {
  name: string;
}

interface ItineraryDay {
  title: string;
  activities: string[];
  dayPhoto?: string;
}

let cachedGeminiKey: string | null = null;
let cachedMapsKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let secretManagerClient: SecretManagerServiceClient | null = null;

async function getSecretManagerClient(): Promise<SecretManagerServiceClient> {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
}

async function getSecret(secretName: string): Promise<string | null> {
  try {
    const sm = await getSecretManagerClient();
    const [version] = await sm.accessSecretVersion({ name: secretName });
    const data = version.payload?.data?.toString();
    if (!data) {
      console.error(`Secret '${secretName}' returned empty payload.`);
      return null;
    }
    return data;
  } catch (error) {
    console.error(`Error accessing secret '${secretName}':`, error);
    return null;
  }
}

async function enrichPlacesWithPhotos(places: IncomingPlace[], apiKey: string | null): Promise<Place[]> {
  if (!apiKey) {
    console.warn('Maps API key is missing. Returning places without photos.');
    return places.map((p: IncomingPlace) => ({ name: p?.name || 'Unknown Place' }));
  }

  const enrichedPromises = places.map(async (place) => {
    const name = place?.name?.trim();
    if (!name) return { name: 'Unnamed Place' };

    try {
      const searchUrl = `${MAPS_TEXT_SEARCH_URL}?query=${encodeURIComponent(name)}&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) throw new Error(`TextSearch API error: ${searchRes.status}`);
      const searchJson = await searchRes.json();

      const firstResult = searchJson.results?.[0];
      const placeId = firstResult?.place_id;
      if (!placeId) {
        console.warn(`No results for "${name}"`);
        return { name };
      }

      const detailsUrl = `${MAPS_DETAILS_URL}?place_id=${placeId}&fields=photos&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      if (!detailsRes.ok) throw new Error(`Details API error: ${detailsRes.status}`);
      const detailsJson = await detailsRes.json();

      const photoRef = detailsJson.result?.photos?.[0]?.photo_reference;
      const photoUrl = photoRef
        ? `${MAPS_PHOTO_BASE_URL}?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`
        : undefined;

      return { name, photoUrl };
    } catch (error) {
      console.error(`Error enriching place "${name}":`, error);
      return { name };
    }
  });

  return Promise.all(enrichedPromises);
}

function parseItineraryMarkdown(markdown: string, enrichedPlaces: Place[]): ItineraryDay[] {
  if (!markdown) return [];

  return markdown.split('###').slice(1).map(block => {
    const lines = block.trim().split('\n');
    const heading = lines.shift() || '';

    const photoMatch = heading.match(/\[\s*PHOTO_SUGGESTION:\s*"([^"]+)"\s*\]/i);
    const title = heading.replace(/\[\s*PHOTO_SUGGESTION:[^\]]+\]/ig, '').trim();

    let dayPhoto: string | undefined;
    if (photoMatch?.[1]) {
      const suggestion = photoMatch[1].toLowerCase();
      dayPhoto = enrichedPlaces.find(p => p.name.toLowerCase() === suggestion)?.photoUrl;
    }

    const activities = lines
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);

    return { title, activities, dayPhoto };
  });
}

async function generateItineraryMarkdown(
  geminiKey: string,
  places: Place[],
  days: number,
  cityName: string
): Promise<string> {
  if (!geminiKey) throw new Error('Gemini API key is missing.');

  if (!cachedGeminiClient) {
    cachedGeminiClient = new GoogleGenerativeAI(geminiKey);
  }

  const model = cachedGeminiClient.getGenerativeModel({ model: GEMINI_MODEL });
  const placeList = places.map(p => `- ${p.name}`).join('\n');

  const prompt = `Generate a ${days}-day Markdown itinerary for ${cityName}.
Each day starts with "### Day N: Title [PHOTO_SUGGESTION: "Place Name"]"
Use 2–4 of the following places:
${placeList}

Example:
### Day 1: Welcome to the City [PHOTO_SUGGESTION: "Main Plaza"]

Be engaging and structured.`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 }
  });

  const markdown = await result.response.text();
  if (!markdown) throw new Error('Empty response from Gemini.');
  return markdown;
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch (error) {
    console.error('Failed to parse JSON body:', error);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { places = [], tripLength = 3, cityName = 'CityBreaker' } = body as {
    places: IncomingPlace[];
    tripLength?: number;
    cityName?: string;
  };

  if (!Array.isArray(places) || !places.length) {
    return NextResponse.json({ error: 'A non-empty "places" array is required.' }, { status: 400 });
  }

  if (typeof cityName !== 'string' || !cityName.trim()) {
    return NextResponse.json({ error: 'A valid "cityName" is required.' }, { status: 400 });
  }

  if (typeof tripLength !== 'number' || tripLength < MIN_TRIP_DAYS) {
    return NextResponse.json({ error: `"tripLength" must be at least ${MIN_TRIP_DAYS} days.` }, { status: 400 });
  }

  const days = Math.min(Math.max(tripLength, MIN_TRIP_DAYS), MAX_TRIP_DAYS);

  const geminiKey = cachedGeminiKey || await getSecret(GEMINI_SECRET_NAME);
  const mapsKey = cachedMapsKey || await getSecret(MAPS_SECRET_NAME);
  if (!geminiKey) return NextResponse.json({ error: 'Missing Gemini key' }, { status: 500 });

  cachedGeminiKey = geminiKey;
  cachedMapsKey = mapsKey;

  let enrichedPlaces: Place[] = [];
  try {
    enrichedPlaces = await enrichPlacesWithPhotos(places, mapsKey);
  } catch (error) {
    console.error('Place enrichment failed:', error);
  }

  try {
    const markdown = await generateItineraryMarkdown(geminiKey, enrichedPlaces, days, cityName);
    const itinerary = parseItineraryMarkdown(markdown, enrichedPlaces);

    return NextResponse.json({
      city: cityName,
      days,
      places: enrichedPlaces,
      itinerary
    });
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('Failed to generate itinerary:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}