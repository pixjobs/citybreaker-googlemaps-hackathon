// src/app/api/travel-tips/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// --- Authentication logic remains the same ---
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

// --- The Main POST Handler for RICH Travel Tips ---

export async function POST(req: NextRequest) {
  console.log("\n--- ✨ New RICH Travel Tips Request Received ---");

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

    // --- NEW, "RICHER" PROMPT ---
    // This prompt asks for a more complex object with multiple facets of the city.
    const prompt = `
You are a world-class travel journalist and a savvy local guide for "${destination}". Your task is to generate a "rich welcome card" for a first-time visitor.

**Instructions:**
- Your entire response MUST be a single, valid JSON object. Do not include any text, markdown, or code fences before or after the JSON.
- Be creative, concise, and insightful.

**Generate the following fields in your JSON response:**
1.  "intro": A single, captivating welcome sentence that sets the scene.
2.  "vibeKeywords": An array of 3-4 single-word strings describing the city's atmosphere (e.g., "Historic", "Futuristic", "Romantic").
3.  "mustDo": A short description of one iconic, can't-miss activity.
4.  "hiddenGem": A description of a lesser-known spot or experience that offers a unique local perspective.
5.  "foodieTip": A recommendation for a specific local dish, drink, or type of food market to try.

**JSON Structure Example:**
{
  "intro": "Welcome to Tokyo, a dazzling metropolis where ancient traditions collide with futuristic neon wonderlands.",
  "vibeKeywords": ["Futuristic", "Orderly", "Vibrant", "Respectful"],
  "mustDo": "Experience the energy of Shibuya Crossing, the world's busiest intersection, especially at night from a nearby cafe.",
  "hiddenGem": "Explore the quiet, old-world charm of the Yanaka district, a glimpse into Tokyo before the skyscrapers.",
  "foodieTip": "Don't leave without trying authentic, fresh sushi for breakfast at the Toyosu Fish Market."
}
`;

    console.log("🟡 [Gemini] Sending prompt for rich travel tips...");
    const model = geminiClient.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("✅ [Gemini] Successfully received rich response.");

    // Parse the JSON response from Gemini
    const richData = JSON.parse(text);

    // --- UPDATED: Return the rich data object directly ---
    return NextResponse.json(richData, { status: 200 });

  } catch (error) {
    console.error("❌ [Error] Rich Travel Tips POST handler failed:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An unknown server error occurred.' },
      { status: 500 }
    );
  }
}