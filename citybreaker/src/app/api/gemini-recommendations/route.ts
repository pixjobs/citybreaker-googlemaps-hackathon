import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const GEMINI_SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';

let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

async function getGeminiApiKeyFromSecretManager(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: GEMINI_SECRET_NAME });
  const payload = version.payload?.data?.toString();

  if (!payload) throw new Error("Secret payload is empty or not found.");
  cachedGeminiApiKey = payload;
  return payload;
}

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) return cachedGeminiClient;

  const apiKey = await getGeminiApiKeyFromSecretManager();
  cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

export async function POST(req: NextRequest) {
  try {
    const geminiClient = await getGeminiClient();
    const { places, tripLength = 3 } = await req.json();

    if (!places || !Array.isArray(places)) {
      return NextResponse.json({ message: 'Invalid input: "places" array is required.' }, { status: 400 });
    }

    const days = Math.min(Math.max(parseInt(tripLength), 3), 7);
    const placeDescriptions = places.map((p: any) => {
      let desc = `- ${p.name}`;
      if (p.types?.length) desc += ` (${p.types.join(', ')})`;
      if (p.rating) desc += ` - Rating: ${p.rating}`;
      return desc;
    }).join('\n');

    const prompt = `
You're an expert travel guide crafting epic city-break itineraries. Based on the list of recommended places from Google Maps, generate a fun, sparkly, and adventurous itinerary for a ${days}-day stay.

**Instructions:**
- Format output in **markdown**, grouped by day.
- Each day should include 2–4 places from the list.
- Add personality! Include:
  - ✨ Hidden gems
  - 🍸 Rooftop bars
  - 🥐 Cosy brunches
  - 🎭 Cultural detours
  - 🌆 Nightlife surprises
- Each day must have a short title (e.g. “Day 2: Hidden Corners & Rooftop Views”).
- If input is empty, return: “No specific recommendations available right now for this area.”

**Places List:**
${placeDescriptions}

**Example Format:**

### Day 1: Elegant Eats & Sunset Views
- Start at [Place 1] for breakfast and people-watching
- Wander through [Place 2], a hidden gem for wine and jazz
- End at [Place 3] with panoramic skyline cocktails
`;

    const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-06-17" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 2048,
      },
    });

    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ itinerary: text }, { status: 200 });

  } catch (error) {
    console.error("Error in Gemini API route:", error);
    return NextResponse.json(
      { message: (error instanceof Error) ? error.message : 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
