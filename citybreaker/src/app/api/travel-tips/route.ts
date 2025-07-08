// src/app/api/travel-tips/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// --- We can reuse the exact same authentication logic from your other route ---
const GEMINI_SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

async function getGeminiApiKeyFromSecretManager(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: GEMINI_SECRET_NAME });
  const payload = version.payload?.data?.toString();
  if (!payload) throw new Error("Secret payload is empty.");
  cachedGeminiApiKey = payload;
  return payload;
}

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) return cachedGeminiClient;
  const apiKey = await getGeminiApiKeyFromSecretManager();
  cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

// --- The Main POST Handler for Travel Tips ---

export async function POST(req: NextRequest) {
  console.log("\n--- ✈️ New Travel Tips Request Received ---");

  try {
    const geminiClient = await getGeminiClient();
    const { destination } = await req.json();
    console.log(`➡️ [Input] Received destination: ${destination}`);

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json(
        { message: 'Invalid input: "destination" string is required.' },
        { status: 400 }
      );
    }

    // This prompt is engineered to return structured JSON, which is much more reliable.
    const prompt = `
You are a witty, savvy, and extremely helpful travel expert. Your goal is to provide a first-time visitor to "${destination}" with a random, fun, and super useful set of tips.

**Instructions:**
- Generate ONE tip for each of the following categories: 'airport', 'transport', and 'funFact'.
- Keep each tip concise (1-2 sentences).
- Make the tips practical and insightful.
- Inject a bit of personality and humor.
- **CRITICAL:** Your entire response MUST be a single, valid JSON object. Do not include any text or markdown formatting before or after the JSON.

**JSON Structure Example:**
{
  "airportTip": "From JFK, the AirTrain to the subway is cheap, but a cab has a flat rate if you're feeling fancy and want to beat the luggage hassle.",
  "transportTip": "The NYC subway runs 24/7, but don't be afraid to walk! Manhattan's grid system makes it surprisingly easy to navigate on foot.",
  "funFact": "Did you know the New York Public Library has over 50 million books and is guarded by two marble lions named Patience and Fortitude?"
}
`;

    console.log("🟡 [Gemini] Sending prompt for travel tips...");
    const model = geminiClient.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Using 1.5 Flash as it's excellent for this
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("✅ [Gemini] Successfully received response.");

    // Parse the JSON response from Gemini
    const tips = JSON.parse(text);

    return NextResponse.json({ tips }, { status: 200 });

  } catch (error) {
    console.error("❌ [Error] Travel Tips POST handler failed:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An unknown server error occurred.' },
      { status: 500 }
    );
  }
}