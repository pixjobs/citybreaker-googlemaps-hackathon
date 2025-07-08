// src/app/api/gemini-recommendations/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const GEMINI_SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';

let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

async function getGeminiApiKeyFromSecretManager(): Promise<string> {
  if (cachedGeminiApiKey) {
    console.log("✅ [Auth] Using cached API key.");
    return cachedGeminiApiKey;
  }

  try {
    console.log("🟡 [Auth] Fetching Gemini API key from Secret Manager...");
    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({ name: GEMINI_SECRET_NAME });
    const payload = version.payload?.data?.toString();

    if (!payload) {
      console.error("❌ Secret payload is empty.");
      throw new Error("Secret payload is empty or not found.");
    }

    cachedGeminiApiKey = payload;
    console.log("✅ [Auth] API key successfully fetched.");
    return payload;
  } catch (error: any) {
    console.error("❌ Failed to access Secret Manager:", error.message);
    throw new Error("Server configuration error: Failed to access API key secret.");
  }
}

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) return cachedGeminiClient;

  const apiKey = await getGeminiApiKeyFromSecretManager();
  cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

export async function POST(req: NextRequest) {
  console.log("\n--- ✨ New Itinerary Request Received ---");

  try {
    const geminiClient = await getGeminiClient();
    const { places, tripLength = 3 } = await req.json();
    console.log(`➡️ [Input] Received ${places?.length || 0} places for a ${tripLength}-day trip.`);

    if (!places || !Array.isArray(places) || places.length === 0) {
      return NextResponse.json(
        { message: 'Invalid input: "places" array is required and cannot be empty.' },
        { status: 400 }
      );
    }

    const days = Math.min(Math.max(parseInt(tripLength, 10), 3), 7);
    const placeDescriptions = places.map((p: any) => `- ${p.name} (Rating: ${p.rating || 'N/A'})`).join('\n');

    const prompt = `
You're an expert travel guide crafting epic city-break itineraries. Based on the list of recommended places from Google Maps, generate a fun, sparkly, and adventurous itinerary for a ${days}-day stay.

**Instructions:**
- Format the output in valid **markdown**.
- Each day must start with a level 3 heading (e.g., "### Day 1: Title").
- **CRITICAL:** On the same line as the day's heading, you MUST add a special tag: \`[PHOTO_SUGGESTION: "Place Name"]\`.
- Each day should include 2–4 places from the provided list.
- Add personality! Include creative suggestions for: ✨ Hidden gems, 🍸 Rooftop bars, 🥐 Cosy brunches, 🎭 Cultural detours, and 🌆 Nightlife surprises.

**Places List:**
${placeDescriptions}

**Correct Example Format:**

### Day 1: Royal Grandeur & Riverside Views [PHOTO_SUGGESTION: "Buckingham Palace"]
- Start your day with a regal breakfast near **Buckingham Palace**.
- Wander through **St. James's Park**, a true hidden gem.
- End the day with a trip on the **London Eye** for stunning city views.
`;

    console.log("🟡 [Gemini] Sending prompt to Gemini...");
    const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-06-17" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("✅ [Gemini] Successfully received response.");

    return NextResponse.json({ itinerary: text }, { status: 200 });
  } catch (error) {
    console.error("❌ [Error] POST handler failed:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An unknown server error occurred.' },
      { status: 500 }
    );
  }
}
