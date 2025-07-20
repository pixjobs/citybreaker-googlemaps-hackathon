// Ensure the runtime is set correctly for your Next.js environment
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// --- Constants ---
const GEMINI_SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET_NAME = 'projects/845341257082/secrets/maps-api-key/versions/latest';
const MAPS_API_BASE_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const MAPS_PHOTO_BASE_URL = 'https://maps.googleapis.com/maps/api/place/photo';
const GEMINI_MODEL = 'gemini-2.5-flash-lite-preview-06-17';
const MAX_TRIP_DAYS = 7;
const MIN_TRIP_DAYS = 3;

// --- Types ---
interface Place {
  name: string;
  photoUrl?: string; // For enriched places
}

interface ItineraryDay {
  title: string;
  activities: string[];
  dayPhoto?: string; // URL of the photo for the day
}

// --- Secret Management ---
let cachedGeminiKey: string | null = null;
let cachedMapsKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let secretManagerClient: SecretManagerServiceClient | null = null;

async function getSecretManagerClient(): Promise<SecretManagerServiceClient> {
  // Lazy initialize Secret Manager client
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

// --- Data Enrichment (Places with Photos) ---
async function enrichPlacesWithPhotos(places: any[], apiKey: string | null): Promise<Place[]> {
  if (!apiKey) {
    console.warn('Maps API key is missing. Cannot enrich places with photos.');
    // Return original places, ensuring they conform to the Place interface
    return places.map((p: any) => ({ name: p?.name || 'Unknown Place', photoUrl: undefined }));
  }

  const enrichedPromises = places.map(async (place) => {
    // Basic validation for place object
    if (!place || typeof place.name !== 'string' || place.name.trim() === '') {
      console.warn('Skipping invalid place object during photo enrichment:', place);
      return { name: 'Invalid Place', photoUrl: undefined };
    }

    const query = encodeURIComponent(place.name);
    let photoUrl: string | undefined = undefined;

    try {
      const mapsApiUrl = `${MAPS_API_BASE_URL}?query=${query}&key=${apiKey}`;
      const res = await fetch(mapsApiUrl);

      if (!res.ok) {
        throw new Error(`Maps API request failed: ${res.status} ${res.statusText}`);
      }

      const json = await res.json();

      // Check for Google Maps API specific errors, not just HTTP status
      if (json.errors) {
          console.error(`Maps API errors for "${place.name}":`, json.errors);
          throw new Error(`Maps API reported errors.`);
      }

      if (json.results && json.results.length > 0) {
        const firstResult = json.results[0];
        const photoRef = firstResult.photos?.[0]?.photo_reference;
        if (photoRef) {
          photoUrl = `${MAPS_PHOTO_BASE_URL}?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`;
        }
      } else {
        console.warn(`No Google Places results found for: "${place.name}"`);
      }
    } catch (error) {
      console.error(`Error fetching photo for "${place.name}":`, error);
      // photoUrl remains undefined
    }
    return { name: place.name, photoUrl };
  });

  return Promise.all(enrichedPromises);
}

// --- Itinerary Parsing ---
const parseItineraryMarkdown = (markdown: string, enrichedPlaces: Place[]): ItineraryDay[] => {
  if (!markdown) return [];

  return markdown.split('###').slice(1).map(block => {
    const lines = block.trim().split('\n');
    const headingRaw = lines.shift() || '';

    const photoSuggestionMatch = headingRaw.match(/\[\s*PHOTO_SUGGESTION: "([^"]+)"\s*\]/i);
    const title = headingRaw.replace(/\[\s*PHOTO_SUGGESTION:[^\]]*\]/ig, '').trim();

    let dayPhotoUrl: string | undefined = undefined;
    if (photoSuggestionMatch && photoSuggestionMatch[1]) {
      const suggestedPlaceName = photoSuggestionMatch[1].toLowerCase();
      const matchedPlace = enrichedPlaces.find(p => p.name.toLowerCase() === suggestedPlaceName);
      dayPhotoUrl = matchedPlace?.photoUrl;
      if (!dayPhotoUrl) {
          console.warn(`Photo suggestion "${photoSuggestionMatch[1]}" found, but no corresponding photo URL available for "${title}".`);
      }
    }

    const activities = lines
      .map(l => l.replace(/^[*-]\s*/, '').trim())
      .filter(l => l);

    return { title, activities, dayPhoto: dayPhotoUrl };
  });
};

// --- Gemini Interaction ---
async function generateItineraryMarkdown(
    geminiKey: string,
    places: Place[],
    days: number,
    cityName: string
): Promise<string> {
    if (!geminiKey) {
        throw new Error('Gemini API key is missing. Cannot generate itinerary.');
    }

    try {
        if (!cachedGeminiClient) {
            cachedGeminiClient = new GoogleGenerativeAI(geminiKey);
        }
        const model = cachedGeminiClient.getGenerativeModel({ model: GEMINI_MODEL });

        const placeNamesList = places.map((p: Place) => `- ${p.name}`).join('\n');
        const prompt = `Generate a ${days}-day Markdown itinerary for ${cityName}.
Each day should follow this format:
### Day N: Title [PHOTO_SUGGESTION: "Place Name for Photo"]

Use 2–4 of the following places in the itinerary:
${placeNamesList}

Focus on creating an engaging and logical day-by-day plan.`;

        const generationConfig = { temperature: 0.7 };

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
        });

        const markdown = await result.response.text();
        if (!markdown) {
            throw new Error('Gemini returned an empty response.');
        }
        return markdown;

    } catch (error) {
        console.error('Error during Gemini content generation:', error);
        throw new Error('Failed to generate itinerary from Gemini.');
    }
}

// --- Route Handler ---
export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch (error) {
    console.error('POST request body parsing failed:', error);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { places = [], tripLength = 3, cityName = 'CityBreaker' } = body;

  // --- Input Validation ---
  if (!Array.isArray(places) || places.length === 0) {
    return NextResponse.json({ error: 'A non-empty "places" array is required.' }, { status: 400 });
  }
  if (typeof cityName !== 'string' || cityName.trim() === '') {
      return NextResponse.json({ error: 'A valid "cityName" is required.' }, { status: 400 });
  }
  if (typeof tripLength !== 'number' || tripLength < 1) {
      return NextResponse.json({ error: '"tripLength" must be a positive number.' }, { status: 400 });
  }

  // Sanitize tripLength
  const days = Math.min(Math.max(tripLength, MIN_TRIP_DAYS), MAX_TRIP_DAYS);

  // --- Retrieve Secrets ---
  const geminiKey = await getSecret(GEMINI_SECRET_NAME);
  const mapsApiKey = await getSecret(MAPS_SECRET_NAME);

  if (!geminiKey) {
    return NextResponse.json({ error: 'Server configuration error: Gemini API key not available.' }, { status: 500 });
  }
  // Maps API key is optional for photo enrichment

  // --- Enrich Places ---
  let enrichedPlaces: Place[] = [];
  try {
    enrichedPlaces = await enrichPlacesWithPhotos(places, mapsApiKey);
  } catch (error) {
    console.error("Failed during place enrichment process:", error);
    // Continue execution, but log the error. Photos might be missing.
    // If this were critical, you might return an error here.
  }

  // --- Generate Itinerary Markdown ---
  let markdownContent: string = '';
  try {
      markdownContent = await generateItineraryMarkdown(geminiKey, enrichedPlaces, days, cityName);
  } catch (error: any) {
      console.error('Itinerary generation failed:', error.message);
      return NextResponse.json({ error: `Failed to generate itinerary: ${error.message}` }, { status: 500 });
  }

  // --- Parse Markdown and Return JSON Response ---
  try {
      const itineraryData = parseItineraryMarkdown(markdownContent, enrichedPlaces);
      // Return structured itinerary data and the (potentially enriched) places
      return NextResponse.json({ itinerary: itineraryData, enrichedPlaces });
  } catch (error) {
      console.error('Itinerary parsing failed:', error);
      return NextResponse.json({ error: 'Failed to parse generated itinerary.' }, { status: 500 });
  }
}