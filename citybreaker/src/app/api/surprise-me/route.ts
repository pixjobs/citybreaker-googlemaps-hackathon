import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { z } from 'zod';

export const runtime = 'nodejs';

const config = {
  gemini: {
    secretName: 'projects/934477100130/secrets/gemini-api-key/versions/latest',
    model: 'gemini-2.5-flash-lite',
  },
  maps: {
    secretName: 'projects/934477100130/secrets/maps-api-key/versions/latest',
    textSearchUrl: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
    detailsUrl: 'https://maps.googleapis.com/maps/api/place/details/json',
    photoBaseUrl: 'https://maps.googleapis.com/maps/api/place/photo',
  },
  fallbackPhotoUrl: 'https://images.unsplash.com/photo-1574704149954-a82d4474b975?q=80&w=1932&auto=format&fit=crop',
};

const SurpriseRequestSchema = z.object({
  prompt: z.enum(['hungry', 'entertain', 'surprise']),
  city: z.object({
    name: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
  }),
});

// --- MODIFICATION: Added 'geometry' to the interface ---
interface GooglePlace {
  place_id: string;
  name: string;
  rating?: number;
  photos?: { photo_reference: string }[];
  formatted_address?: string;
  website?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

let cachedSecrets: { geminiKey?: string; mapsKey?: string } = {};
const cachedClients: { gemini?: GoogleGenerativeAI; secretManager?: SecretManagerServiceClient } = {};

async function getSecret(secretName: string): Promise<string> {
  if (!cachedClients.secretManager) {
    cachedClients.secretManager = new SecretManagerServiceClient();
  }
  const [version] = await cachedClients.secretManager.accessSecretVersion({ name: secretName });
  const data = version.payload?.data?.toString();
  if (!data) {
    throw new Error(`Secret '${secretName}' is empty.`);
  }
  return data;
}

function getPlaceQueryForPrompt(prompt: z.infer<typeof SurpriseRequestSchema>['prompt']) {
  const queries = {
    hungry: { type: 'restaurant', keyword: 'highly rated memorable dinner unique' },
    entertain: { type: 'tourist_attraction', keyword: 'live music art gallery unique show' },
    surprise: { type: 'point_of_interest', keyword: 'hidden gem unique experience local favorite' },
  };
  return queries[prompt];
}

async function findPlacesResiliently(params: {
  keyword: string;
  city: z.infer<typeof SurpriseRequestSchema>['city'];
  type: string;
  apiKey: string;
}): Promise<GooglePlace[]> {
  const search = async (opennow: boolean): Promise<GooglePlace[]> => {
    const searchParams = new URLSearchParams({
      query: `${params.keyword} in ${params.city.name}`,
      location: `${params.city.lat},${params.city.lng}`,
      radius: '15000',
      type: params.type,
      key: params.apiKey,
    });
    if (opennow) {
      searchParams.set('opennow', 'true');
    }
    const res = await fetch(`${config.maps.textSearchUrl}?${searchParams.toString()}`);
    if (!res.ok) {
      throw new Error(`Maps TextSearch API error: ${res.status}`);
    }
    const data = await res.json();
    return data.results || [];
  };

  let places = await search(true);
  if (places.length < 3) {
    places = await search(false);
  }
  return places;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationResult = SurpriseRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body.', details: validationResult.error.flatten() },
        { status: 400 },
      );
    }
    const { prompt, city } = validationResult.data;

    if (!cachedSecrets.geminiKey || !cachedSecrets.mapsKey) {
      const [geminiKey, mapsKey] = await Promise.all([
        getSecret(config.gemini.secretName),
        getSecret(config.maps.secretName),
      ]);
      cachedSecrets = { geminiKey, mapsKey };
    }

    const { geminiKey, mapsKey } = cachedSecrets;
    if (!geminiKey || !mapsKey) {
      throw new Error('API keys not loaded.');
    }

    const allPlaces = await findPlacesResiliently({
      keyword: getPlaceQueryForPrompt(prompt).keyword,
      city,
      type: getPlaceQueryForPrompt(prompt).type,
      apiKey: mapsKey,
    });

    if (allPlaces.length === 0) {
      return NextResponse.json(
        { error: 'We searched high and low but couldn’t find a matching spot. Try again!' },
        { status: 404 },
      );
    }

    const shuffled = allPlaces.sort(() => 0.5 - Math.random());
    const placesToSuggest = shuffled.slice(0, 3);

    const suggestionPromises = placesToSuggest.map(async (place) => {
      try {
        // --- MODIFICATION: Added 'geometry' to the fields parameter ---
        const detailsParams = new URLSearchParams({
          place_id: place.place_id,
          fields: 'name,formatted_address,rating,photos,website,geometry',
          key: mapsKey,
        });

        const detailsRes = await fetch(`${config.maps.detailsUrl}?${detailsParams.toString()}`);
        if (!detailsRes.ok) return null;

        const detailsData = await detailsRes.json();
        const details: GooglePlace = detailsData.result;
        if (!details || !details.geometry) return null;

        if (!cachedClients.gemini) {
          cachedClients.gemini = new GoogleGenerativeAI(geminiKey);
        }
        const model = cachedClients.gemini.getGenerativeModel({
          model: config.gemini.model,
          generationConfig: { responseMimeType: 'application/json' },
        });

        const geminiPrompt = `
          For the place "${details.name}" in ${city.name}, act as a witty travel guide for a user who chose the prompt "${prompt}".
          Respond with ONLY a valid JSON object with three keys:
          1. "description": A short, thrilling, one-paragraph suggestion. Make it sound like an adventure.
          2. "whyWorthIt": A single, compelling sentence explaining why this place is worth the user’s time.
          3. "transportInfo": A single sentence with practical advice on the most convenient transport (e.g., "Best reached by taxi", "A short walk from the central metro station", "Take the number 12 bus").
          
          Do not include any other text or markdown formatting.
        `;

        const result = await model.generateContent(geminiPrompt);
        const geminiText = result.response.text();

        let geminiData: {
          description: string;
          whyWorthIt: string;
          transportInfo: string;
        };

        try {
          geminiData = JSON.parse(geminiText);
        } catch {
          console.error('Failed to parse Gemini JSON:', geminiText);
          geminiData = {
            description: geminiText,
            whyWorthIt: 'An unforgettable local experience!',
            transportInfo: 'Check local maps for the best route.',
          };
        }

        const photoUrl = details.photos?.[0]?.photo_reference
          ? `${config.maps.photoBaseUrl}?maxwidth=800&photoreference=${details.photos[0].photo_reference}&key=${mapsKey}`
          : config.fallbackPhotoUrl;

        const tripAdvisorUrl = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(details.name + ' ' + city.name)}`;
        
        // --- MODIFICATION: Added 'lat' and 'lng' to the final returned object ---
        return {
          name: details.name,
          photoUrl,
          description: geminiData.description,
          whyWorthIt: geminiData.whyWorthIt,
          transportInfo: geminiData.transportInfo,
          address: details.formatted_address,
          rating: details.rating,
          website: details.website,
          tripAdvisorUrl,
          lat: details.geometry.location.lat,
          lng: details.geometry.location.lng,
        };
      } catch (err) {
        console.error(`Failed to process place ID ${place.place_id}:`, err);
        return null;
      }
    });

    const suggestions = (await Promise.all(suggestionPromises)).filter(Boolean);
    if (suggestions.length === 0) {
      throw new Error('Could not generate suggestions.');
    }

    return NextResponse.json(suggestions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An internal server error occurred.';
    console.error('Surprise Me API Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}