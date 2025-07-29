export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// --- SECRET AND MODEL CONFIGURATION ---
const GEMINI_SECRET_NAME = 'projects/934477100130/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET_NAME = 'projects/934477100130/secrets/places-api-key/versions/latest';
const GEMINI_MODEL = 'gemini-2.5-flash-lite'; 

// --- NEW PLACES API ENDPOINTS ---
const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_PHOTO_BASE_URL = 'https://places.googleapis.com/v1';

// --- TRIP CONSTRAINTS ---
const MAX_TRIP_DAYS = 7;
const MIN_TRIP_DAYS = 3;

// --- TYPE DEFINITIONS ---
interface IncomingPlace { name: string; }
interface EnrichedPlace {
  name: string;
  placeId?: string;
  photoUrl?: string;
  website?: string;
  googleMapsUrl?: string;
  location?: { lat: number; lng: number };
}
interface ItineraryActivity { title: string; description: string; whyVisit: string; insiderTip: string; priceRange: string; audience: string; placeName: string; }
interface GeminiItineraryDay { title: string; dayPhotoSuggestion: string; activities: ItineraryActivity[]; }
interface ItineraryDay { title: string; dayPhotoUrl?: string; activities: EnrichedPlace[]; }
interface RequestBody { places?: IncomingPlace[]; tripLength?: number; cityName?: string; }

// --- CACHING ---
let cachedGeminiKey: string | null = null;
let cachedMapsKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let secretManagerClient: SecretManagerServiceClient | null = null;

// --- HELPER FUNCTIONS ---

async function getSecretManagerClient(): Promise<SecretManagerServiceClient> {
  if (!secretManagerClient) secretManagerClient = new SecretManagerServiceClient();
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

/**
 * [FIXED] This function is updated to use the new Places API (v1).
 * It now makes a single, more efficient API call per place.
 */
async function enrichPlaces(places: IncomingPlace[], apiKey: string | null): Promise<EnrichedPlace[]> {
  if (!apiKey) {
    console.warn('Maps API key is missing. Proceeding without place enrichment.');
    return places.map((p: IncomingPlace) => ({ name: p?.name || 'Unknown Place' }));
  }

  const enrichedPromises = places.map(async (place) => {
    const name = place?.name?.trim();
    if (!name) return { name: 'Unnamed Place' };

    try {
      // The new API uses a POST request with the query in the body
      const requestBody = { textQuery: name };
      
      // Headers are used for the API key and to specify which fields we want back.
      // This 'field mask' is what allows us to get all data in one call.
      const requestHeaders = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.location,places.photos',
      };

      const searchRes = await fetch(PLACES_SEARCH_TEXT_URL, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });

      if (!searchRes.ok) {
        const errorBody = await searchRes.text();
        throw new Error(`Places API searchText error: ${searchRes.status}. Body: ${errorBody}`);
      }

      const searchJson = await searchRes.json();
      const firstResult = searchJson.places?.[0];
      
      if (!firstResult) {
        console.warn(`No results for "${name}" from the new Places API.`);
        return { name };
      }
      
      // The new photo reference is a full resource name.
      const photoName = firstResult.photos?.[0]?.name;
      // The photo URL must be constructed differently.
      const photoUrl = photoName 
        ? `${PLACES_PHOTO_BASE_URL}/${photoName}/media?key=${apiKey}&maxHeightPx=800` 
        : undefined;

      return {
          name: firstResult.displayName?.text || name, // Use the display name from Google
          placeId: firstResult.id,
          photoUrl,
          website: firstResult.websiteUri,
          googleMapsUrl: firstResult.googleMapsUri,
          location: firstResult.location,
      };
    } catch (error) {
      console.error(`Error enriching place "${name}":`, error);
      return { name }; // Return the original name on failure
    }
  });

  return Promise.all(enrichedPromises);
}


function extractJsonFromString(text: string): string | null {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
}

async function generateItineraryJson(geminiKey: string, places: EnrichedPlace[], days: number, cityName: string): Promise<ItineraryDay[]> {
  if (!geminiKey) throw new Error('Gemini API key is missing.');
  if (!cachedGeminiClient) cachedGeminiClient = new GoogleGenerativeAI(geminiKey);

  const model = cachedGeminiClient.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json" }
  });

  const placeList = places.map(p => `"${p.name}"`).join(', ');
  const prompt = `
    You are a world-class travel concierge. For a ${days}-day trip to ${cityName}, generate a response as a valid JSON object.
    Your entire response must be ONLY the JSON object, starting with { and ending with }. Do not include any other text or markdown.
    The JSON object must have a single key "itinerary", which is an array of day objects.
    Each day object must have "title", "dayPhotoSuggestion", and "activities" keys.
    Each activity object must have "title", "description", "whyVisit", "insiderTip", "priceRange", "audience", and "placeName" keys.
    The "placeName" value must be an exact name from this list: [${placeList}].
    The tone must be sophisticated and inspiring.
    `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  try {
    const cleanJsonString = extractJsonFromString(responseText);
    if (!cleanJsonString) {
        throw new Error("No valid JSON object found in the AI response.");
    }
    const data = JSON.parse(cleanJsonString);
    return (data.itinerary || []).map((day: GeminiItineraryDay) => {
        const suggestedPlaceName = day.dayPhotoSuggestion?.toLowerCase();
        // Find the enriched place details for the photo suggestion
        const photoPlace = places.find(p => p.name.toLowerCase() === suggestedPlaceName);
        
        // Map activities and enrich them with full place data
        const enrichedActivities = day.activities.map(activity => {
            const activityPlace = places.find(p => p.name === activity.placeName);
            return {
                ...activity,
                ...(activityPlace && { // Spread the enriched details into the activity
                    placeId: activityPlace.placeId,
                    photoUrl: activityPlace.photoUrl,
                    website: activityPlace.website,
                    googleMapsUrl: activityPlace.googleMapsUrl,
                    location: activityPlace.location,
                })
            };
        });

        return {
            title: day.title,
            activities: enrichedActivities,
            dayPhotoUrl: photoPlace?.photoUrl
        };
    });
  } catch (e: unknown) {
    console.error("--- DEBUG: Failed to parse Gemini JSON for itinerary. Raw response was: ---");
    console.error(responseText);
    console.error("--- Parsing Error Details ---", e);
    console.error("--- END DEBUG ---");
    throw new Error("Could not generate a valid itinerary structure from AI response.");
  }
}

// --- MAIN API HANDLER ---
export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { places = [], tripLength = 3, cityName = 'CityBreaker' } = body;

  // --- VALIDATION ---
  if (!Array.isArray(places) || !places.length) { return NextResponse.json({ error: 'A non-empty "places" array is required.' }, { status: 400 }); }
  if (typeof cityName !== 'string' || !cityName.trim()) { return NextResponse.json({ error: 'A valid "cityName" is required.' }, { status: 400 }); }
  if (typeof tripLength !== 'number' || tripLength < MIN_TRIP_DAYS) { return NextResponse.json({ error: `"tripLength" must be at least ${MIN_TRIP_DAYS} day(s).` }, { status: 400 }); }
  
  const days = Math.min(Math.max(tripLength, MIN_TRIP_DAYS), MAX_TRIP_DAYS);

  try {
    // --- FETCH SECRETS ---
    if (!cachedGeminiKey) cachedGeminiKey = await getSecret(GEMINI_SECRET_NAME);
    if (!cachedMapsKey) cachedMapsKey = await getSecret(MAPS_SECRET_NAME);
    if (!cachedGeminiKey) {
      console.error("FATAL: Gemini API key could not be retrieved.");
      return NextResponse.json({ error: 'Server configuration error: Missing Gemini key' }, { status: 500 });
    }

    // --- MAIN LOGIC ---
    const enrichedPlaces = await enrichPlaces(places, cachedMapsKey);
    const itinerary = await generateItineraryJson(cachedGeminiKey, enrichedPlaces, days, cityName);

    return NextResponse.json({
      city: cityName,
      days,
      places: enrichedPlaces,
      itinerary: itinerary
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred during itinerary generation.';
    console.error('Root error in POST handler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}