// app/api/gemini-recommendations/json/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Firestore cache helpers (new V2)
import {
  getCachedItinerary,
  storeCachedItinerary,
  computePlacesSignature,
  hashSignature,
  getManyPlaceEnrichments,
  upsertPlaceEnrichment,
  isPlaceFresh,
  placeKeyFromName,
  DEFAULT_ITINERARY_TTL_MS,
  type FirestoreItineraryCacheV2,
} from '@/lib/firestoreCache';

// --- Constants ---
const GEMINI_SECRET_NAME = 'projects/934477100130/secrets/gemini-api-key/versions/latest';
const MAPS_SECRET_NAME   = 'projects/934477100130/secrets/places-api-key/versions/latest';
const GEMINI_MODEL       = 'gemini-2.5-flash-lite';

const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_PHOTO_BASE_URL  = 'https://places.googleapis.com/v1';

const MAX_TRIP_DAYS = 7;
const MIN_TRIP_DAYS = 3;

// --- Types ---
interface IncomingPlace { name: string }

interface EnrichedPlace {
  name: string;
  placeId?: string;
  photoUrl?: string;
  website?: string;
  googleMapsUrl?: string;
  location?: { lat: number; lng: number };
}

interface ItineraryActivity {
  title: string;
  description: string;
  whyVisit: string;
  insiderTip: string;
  priceRange: string;
  audience: string;
  placeName: string;
}

interface GeminiItineraryDay {
  title: string;
  dayPhotoSuggestion: string;
  activities: ItineraryActivity[];
}

interface ItineraryDay {
  title: string;
  dayPhotoUrl?: string;
  activities: (ItineraryActivity & Partial<EnrichedPlace>)[];
}

interface RequestBody {
  places?: IncomingPlace[];
  tripLength?: number;
  cityName?: string;
}

interface FullItineraryResponse {
  city: string;
  days: number;
  places: EnrichedPlace[];
  itinerary: ItineraryDay[];
  createdAt: string; // always present
}

// --- Singletons ---
let secretManagerClient: SecretManagerServiceClient | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let cachedGeminiKey: string | null = null;
let cachedMapsKey: string | null = null;

// --- Helpers ---
async function getSecret(name: string): Promise<string> {
  if (!secretManagerClient) secretManagerClient = new SecretManagerServiceClient();
  const [version] = await secretManagerClient.accessSecretVersion({ name });
  const data = version.payload?.data?.toString();
  if (!data) throw new Error(`Secret '${name}' returned an empty payload.`);
  return data;
}

function normalizeCity(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '-');
}

function extractJsonFromString(text: string): string | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  const tryParse = (s: string | null) => {
    if (!s) return null;
    try { JSON.parse(s); return s; } catch { return null; }
  };
  const codeBlock = tryParse(match ? match[1] : null);
  if (codeBlock) return codeBlock;

  const first = text.indexOf('{');
  const last  = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  return tryParse(text.slice(first, last + 1));
}

function isCacheFresh(doc: FirestoreItineraryCacheV2, now = Date.now(), ttl = DEFAULT_ITINERARY_TTL_MS): boolean {
  const tsMs =
    doc.createdAt
      ? new Date(doc.createdAt).getTime()
      : doc.updatedAt?.toDate?.().getTime?.();
  if (!tsMs || Number.isNaN(tsMs)) return false;
  return now - tsMs < ttl;
}

// --- Per-place enrichment using shared Firestore cache ---
async function enrichPlacesWithCache(
  places: IncomingPlace[],
  apiKey: string | null,
  cityNameForDisambig?: string
): Promise<EnrichedPlace[]> {
  const requested = (places || [])
    .map(p => (p?.name || '').trim())
    .filter(Boolean);

  // 1) read from shared cache
  const cachedMap = await getManyPlaceEnrichments(requested);
  const now = Date.now();
  const needLookup: string[] = [];
  const fromCache = new Map<string, EnrichedPlace>();

  for (const name of requested) {
    const key = placeKeyFromName(name);
    const doc = cachedMap.get(key);
    if (doc && isPlaceFresh(doc, now)) {
      fromCache.set(name, doc.place as EnrichedPlace);
    } else {
      needLookup.push(name);
    }
  }

  // 2) fetch missing/stale from Places (if key present)
  const fetched: Record<string, EnrichedPlace> = {};
  if (needLookup.length && apiKey) {
    await Promise.all(
      needLookup.map(async (name) => {
        const query = cityNameForDisambig ? `${name} in ${cityNameForDisambig}` : name;
        try {
          const res = await fetch(PLACES_SEARCH_TEXT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.location,places.photos',
            },
            body: JSON.stringify({ textQuery: query }),
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const json = await res.json();
          const place = json.places?.[0];
          const photoName = place?.photos?.[0]?.name as string | undefined;
          const enriched: EnrichedPlace = {
            name: place?.displayName?.text || name,
            placeId: place?.id,
            photoUrl: photoName ? `${PLACES_PHOTO_BASE_URL}/${photoName}/media?key=${apiKey}&maxHeightPx=800` : undefined,
            website: place?.websiteUri,
            googleMapsUrl: place?.googleMapsUri,
            location: place?.location,
          };
          fetched[name] = enriched;
          await upsertPlaceEnrichment(name, enriched);
        } catch (e) {
          console.error('Places lookup failed for', name, e);
          const fallback: EnrichedPlace = { name };
          fetched[name] = fallback;
          await upsertPlaceEnrichment(name, fallback); // cache the miss too
        }
      })
    );
  }

  // 3) assemble in original order
  return requested.map(name => fromCache.get(name) || fetched[name] || { name });
}

// --- Gemini itinerary generation ---
async function generateItineraryJson(
  geminiKey: string,
  places: EnrichedPlace[],
  days: number,
  cityName: string
): Promise<{ itinerary: ItineraryDay[]; prompt: string; rawText: string }> {
  if (!cachedGeminiClient) cachedGeminiClient = new GoogleGenerativeAI(geminiKey);

  const model = cachedGeminiClient.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const placeList = places.map(p => `"${p.name}"`).join(', ');
  const prompt =
    `You are a world-class travel concierge.\n` +
    `For a ${days}-day trip to ${cityName}, reply with a single valid JSON object like: {"itinerary":[...]}\n` +
    `Use ONLY these places where appropriate: [${placeList}].\n` +
    `Each day object: {"title": string, "dayPhotoSuggestion": string (one of the listed places), "activities": [\n` +
    `  {"title","description","whyVisit","insiderTip","priceRange","audience","placeName"}\n` +
    `]}\n` +
    `Do not include Markdown or code fences unless the content is valid JSON inside them.`;

  const result = await model.generateContent(prompt);
  const rawText = result.response.text();
  const cleanJson = extractJsonFromString(rawText);
  if (!cleanJson) throw new Error('Gemini returned invalid or non-JSON content.');

  const data = JSON.parse(cleanJson);
  if (!Array.isArray(data.itinerary)) throw new Error('Gemini JSON missing "itinerary" array.');

  const itinerary: ItineraryDay[] = data.itinerary.map((day: GeminiItineraryDay) => {
    const photoPlace = places.find(
      p => p.name.toLowerCase() === day.dayPhotoSuggestion?.toLowerCase()
    );
    const activities = (day.activities || []).map((act: ItineraryActivity) => {
      const match =
        places.find(p => p.name === act.placeName) ||
        places.find(p => p.name.toLowerCase() === act.placeName?.toLowerCase());
      return { ...act, ...(match || {}) };
    });
    return {
      title: day.title,
      dayPhotoUrl: photoPlace?.photoUrl ?? places.find(p => p.photoUrl)?.photoUrl,
      activities,
    };
  });

  return { itinerary, prompt, rawText };
}

// --- Main API Handler ---
export async function POST(req: NextRequest) {
  // Parse safely
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid or empty JSON body.' }, { status: 400 });
  }

  const { places = [], tripLength = 3, cityName = 'CityBreaker' } = body;
  if (!Array.isArray(places) || places.length === 0) {
    return NextResponse.json({ error: 'A non-empty "places" array is required.' }, { status: 400 });
  }

  // Normalize inputs
  const days = Math.min(Math.max(tripLength, MIN_TRIP_DAYS), MAX_TRIP_DAYS);
  const normCity = normalizeCity(cityName);

  // Cross-user cache keying by places set
  const sig = computePlacesSignature(places);
  const sigHash = hashSignature(sig); // short hash in key
  const variant = 'basic';

  try {
    // --- Cache read (shared across users) ---
    const cached = await getCachedItinerary(normCity, days, { signatureHash: sigHash, variant });
    if (cached && isCacheFresh(cached)) {
      console.log(`API: Returning FRESH cached itinerary for ${normCity}, ${days} days, sig=${sigHash}.`);
      const respFromCache: FullItineraryResponse = {
        city: cached.city,
        days: cached.days,
        places: cached.places as EnrichedPlace[],
        itinerary: cached.itinerary as ItineraryDay[],
        createdAt: cached.createdAt ?? cached.updatedAt.toDate().toISOString(),
      };
      return NextResponse.json(respFromCache);
    }

    // --- Secrets ---
    if (!cachedGeminiKey) cachedGeminiKey = await getSecret(GEMINI_SECRET_NAME);
    if (!cachedMapsKey)   cachedMapsKey   = await getSecret(MAPS_SECRET_NAME);

    // --- Enrich (shared per-place cache) & Generate ---
    const enrichedPlaces = await enrichPlacesWithCache(places, cachedMapsKey, cityName);
    const { itinerary, prompt, rawText } = await generateItineraryJson(
      cachedGeminiKey,
      enrichedPlaces,
      days,
      cityName
    );

    const response: FullItineraryResponse = {
      city: cityName,
      days,
      places: enrichedPlaces,
      itinerary,
      createdAt: new Date().toISOString(),
    };

    // --- Cache write (shared across users) ---
    const toCache: Omit<FirestoreItineraryCacheV2, 'updatedAt'> = {
      city: normCity, // store normalized city in doc
      days,
      places: enrichedPlaces,
      itinerary,
      createdAt: response.createdAt,
      meta: {
        cacheVersion: 2,
        model: GEMINI_MODEL,
        prompt,
        rawGeminiText: rawText,
        placesSignature: sig,
        signatureHash: sigHash,
        variant,
        summaryLevel: 'standard',
        responseType: 'json',
        ttlMs: DEFAULT_ITINERARY_TTL_MS,
        source: 'generated',
      },
    };

    await storeCachedItinerary(normCity, days, toCache, { signatureHash: sigHash, variant });
    console.log(`API: Stored itinerary for ${normCity}, ${days} days, sig=${sigHash}.`);

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('API Route Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: `Server Error: ${msg}` }, { status: 500 });
  }
}
