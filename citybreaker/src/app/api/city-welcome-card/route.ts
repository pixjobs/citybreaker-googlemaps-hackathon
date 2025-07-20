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
const GEMINI_TIP_FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout

// --- Types ---
interface Place {
  name: string;
  photoUrl?: string;
}
// CityWelcomeCardTips now uses optional fields to be resilient to Gemini's output
interface CityWelcomeCardTips {
  intro?: string;
  vibeKeywords?: string[];
  mustDo?: string;
  hiddenGem?: string;
  foodieTip?: string;
}
// Response structure from the backend route
interface CityWelcomeCardResponse extends CityWelcomeCardTips {
  relevantPlacesWithPhotos?: Place[];
}

// --- Secret Management ---
let cachedGeminiKey: string | null = null;
let cachedMapsKey: string | null = null; // Cache for Maps API Key
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let secretManagerClient: SecretManagerServiceClient | null = null;

// Lazy initialize Secret Manager client
async function getSecretManagerClient(): Promise<SecretManagerServiceClient> {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
}

// Function to securely get secrets, with dev fallback for Maps API key
async function getSecret(secretName: string): Promise<string | null> {
  // DEV MODE fallback for Maps API Key if not found in Secret Manager
  if (process.env.NODE_ENV === "development" && secretName === MAPS_SECRET_NAME && process.env.NEXT_PUBLIC_MAPS_API_KEY) {
    console.log("🟡 [Auth] Using Maps API key from .env.local");
    return process.env.NEXT_PUBLIC_MAPS_API_KEY;
  }

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

// --- Google Maps Photo Enrichment ---
async function enrichPlacesWithPhotos(placeNames: string[], apiKey: string | null): Promise<Place[]> {
  if (!apiKey) {
    console.warn('Maps API key is missing. Cannot enrich places.');
    return placeNames.map(name => ({ name, photoUrl: undefined }));
  }

  const enrichedPromises = placeNames.map(async (name) => {
    // Basic validation for place name
    if (typeof name !== 'string' || name.trim() === '') {
      console.warn('Skipping invalid place name during photo enrichment:', name);
      return { name: 'Invalid Place', photoUrl: undefined };
    }

    const query = encodeURIComponent(name);
    let photoUrl: string | undefined = undefined;

    try {
      const mapsApiUrl = `${MAPS_API_BASE_URL}?query=${query}&key=${apiKey}`;
      const res = await fetch(mapsApiUrl);

      if (!res.ok) throw new Error(`Maps API request failed: ${res.status} ${res.statusText}`);
      const json = await res.json();

      if (json.errors) { // Check for API-level errors
          console.error(`Maps API errors for "${name}":`, json.errors);
          throw new Error(`Maps API reported errors.`);
      }

      if (json.results && json.results.length > 0) {
        const firstResult = json.results[0];
        const photoRef = firstResult.photos?.[0]?.photo_reference;
        if (photoRef) {
          photoUrl = `${MAPS_PHOTO_BASE_URL}?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`;
        }
      } else {
        console.warn(`No Google Places results found for: "${name}"`);
      }
    } catch (error) { console.error(`Error fetching photo for "${name}":`, error); }
    return { name, photoUrl };
  });

  return Promise.all(enrichedPromises);
}

// --- Gemini Interaction ---
async function generateCityWelcomeCardJson(
    geminiKey: string,
    destination: string
): Promise<CityWelcomeCardTips> {
    if (!geminiKey) throw new Error('Gemini API key is missing.');

    try {
        if (!cachedGeminiClient) cachedGeminiClient = new GoogleGenerativeAI(geminiKey);
        const model = cachedGeminiClient.getGenerativeModel({ model: GEMINI_MODEL });

        // Enhanced prompt: Instruct Gemini to ALWAYS include all fields, using defaults if necessary, and to tag places.
        const prompt = `
You are a travel guide for "${destination}". Generate a "rich welcome card" in valid JSON format.
**Instructions:**
- ALL fields MUST be present in the JSON. If you cannot provide a value, use an empty string "" for strings, or an empty array [] for vibeKeywords.
- Identify key places mentioned in your tips (landmarks, restaurants, markets) and tag them immediately after using the format "[PLACE_NAME: "Place Name"]".
- **JSON Fields:** "intro" (captivating welcome), "vibeKeywords" (array of 3-4 single-word strings), "mustDo" (iconic activity with tagged place), "hiddenGem" (local perspective with tagged place), "foodieTip" (local food recommendation with tagged place).
- Be creative, concise, and insightful.
`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIP_FETCH_TIMEOUT_MS);

        let result;
        try {
            result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 },
                // abortSignal: controller.signal // Uncomment if you want explicit aborts
            });
        } catch (timeoutError) {
            console.error("⏰ Timeout or Gemini error:", timeoutError);
            throw new Error("Gemini model timed out or failed.");
        } finally {
            clearTimeout(timeoutId);
        }

        const raw = result.response.text().trim();
        let cleaned = raw.startsWith("```json") ? raw.replace(/^```json/, "").replace(/```$/, "").trim() : raw;
        
        let parsedData: any;
        try {
            parsedData = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error("❌ Failed to parse Gemini response as JSON:", parseErr);
            console.warn("🧾 Raw Gemini output:", cleaned);
            throw new Error("Gemini returned malformed JSON.");
        }

        // Validate structure and provide safe defaults for all expected fields
        const welcomeCard: CityWelcomeCardTips = {
            intro: typeof parsedData.intro === 'string' ? parsedData.intro : "Welcome!",
            vibeKeywords: Array.isArray(parsedData.vibeKeywords) ? parsedData.vibeKeywords : [],
            mustDo: typeof parsedData.mustDo === 'string' ? parsedData.mustDo : "",
            hiddenGem: typeof parsedData.hiddenGem === 'string' ? parsedData.hiddenGem : "",
            foodieTip: typeof parsedData.foodieTip === 'string' ? parsedData.foodieTip : "",
        };
        
        return welcomeCard;

    } catch (error: any) {
        console.error('Gemini city welcome card generation failed:', error.message);
        throw new Error('Failed to generate city welcome card from Gemini.');
    }
}

// --- Route Handler ---
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); }
  catch (error) { console.error('POST request body parsing failed:', error); return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }); }

  const { destination } = body;
  if (!destination || typeof destination !== 'string' || destination.trim() === '') {
      return NextResponse.json({ error: 'A valid "destination" string is required.' }, { status: 400 });
  }

  const geminiKey = await getSecret(GEMINI_SECRET_NAME);
  const mapsApiKey = await getSecret(MAPS_SECRET_NAME);

  if (!geminiKey) {
    return NextResponse.json({ error: 'Server configuration error: Gemini API key not available.' }, { status: 500 });
  }
  // Maps API key is optional for photo enrichment, so we don't throw an error if it's missing, just warn.

  let welcomeCardTips: CityWelcomeCardTips | null = null;
  try {
    welcomeCardTips = await generateCityWelcomeCardJson(geminiKey, destination);
  } catch (error: any) {
      console.error('City welcome card generation failed:', error.message);
      // Return a generic error if generation fails, without exposing too much detail
      return NextResponse.json({ error: 'Failed to generate city welcome card. Please try again later.' }, { status: 500 });
  }

  if (!welcomeCardTips) {
      // This case should ideally be caught by the error above, but as a safeguard
      return NextResponse.json({ error: 'Failed to retrieve city welcome card.' }, { status: 500 });
  }

  // --- Extract Place Names for Photo Fetching ---
  const placeTagRegex = /\[\s*PLACE_NAME:\s*"([^"]+)"\s*\]/ig;
  const placeNamesFromTips: string[] = [];

  // Iterate over *all* values in the welcomeCardTips object to find place names
  Object.values(welcomeCardTips).forEach(tip => {
    if (typeof tip === 'string') { // Process only if the value is a string
      let match;
      // Use regex to find all occurrences of the [PLACE_NAME: "..."] tag
      while ((match = placeTagRegex.exec(tip)) !== null) {
        // Ensure match and the captured group (place name) are valid strings
        if (match && typeof match === 'string' && match.trim() !== '') {
          placeNamesFromTips.push(match.trim()); // Push the trimmed place name
        } else {
          console.warn(`Skipping malformed or empty PLACE_NAME tag found in tip: "${tip}"`);
        }
      }
    }
  });
  
  // Remove duplicates and ensure all are strings
  const uniquePlaceNames = [...new Set(placeNamesFromTips)];

  // --- Enrich Extracted Places with Photos ---
  let relevantPlacesWithPhotos: Place[] = [];
  if (uniquePlaceNames.length > 0) {
    try {
      relevantPlacesWithPhotos = await enrichPlacesWithPhotos(uniquePlaceNames, mapsApiKey);
    } catch (error) {
      console.error("Failed during enrichment of places from tips:", error);
      // Continue execution, but log the error. Photos might be missing.
    }
  }

  // --- Prepare Final Response ---
  const responseData: CityWelcomeCardResponse = {
    ...welcomeCardTips, // Spread the tips from Gemini
    // Add only the places that successfully got a photo URL
    relevantPlacesWithPhotos: relevantPlacesWithPhotos.filter(p => p.photoUrl),
  };

  return NextResponse.json(responseData, { status: 200 });
}