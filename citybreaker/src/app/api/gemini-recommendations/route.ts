// src/app/api/gemini-recommendations/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'; // NEW IMPORT

// Define the secret resource name from your Secret Manager path
// It includes: projects/PROJECT_NUMBER/secrets/SECRET_NAME/versions/VERSION
// 'latest' is a common and convenient version to use.
const GEMINI_SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';

// Cache for the Gemini API key and the Generative AI client
// This prevents fetching the secret on every request,
// which is good for performance and avoiding Secret Manager quotas.
let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

/**
 * Fetches the Gemini API key from Google Cloud Secret Manager.
 * Caches the result after the first successful fetch.
 */
async function getGeminiApiKeyFromSecretManager(): Promise<string> {
  if (cachedGeminiApiKey) {
    return cachedGeminiApiKey; // Return cached value if available
  }

  const client = new SecretManagerServiceClient();

  try {
    const [version] = await client.accessSecretVersion({
      name: GEMINI_SECRET_NAME,
    });

    const payload = version.payload?.data?.toString();
    if (!payload) {
      throw new Error("Secret payload is empty or not found.");
    }
    cachedGeminiApiKey = payload; // Cache the value
    return payload;
  } catch (error) {
    console.error(`Failed to retrieve secret ${GEMINI_SECRET_NAME} from Secret Manager:`, error);
    throw new Error("Failed to retrieve Gemini API key from Secret Manager.");
  }
}

/**
 * Initializes and returns the GoogleGenerativeAI client.
 * Caches the client instance after the first initialization.
 */
async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) {
    return cachedGeminiClient; // Return cached client if available
  }

  try {
    const apiKey = await getGeminiApiKeyFromSecretManager();
    cachedGeminiClient = new GoogleGenerativeAI(apiKey); // Initialize and cache
    return cachedGeminiClient;
  } catch (error) {
    console.error("Failed to initialize Gemini client:", error);
    throw new Error("Failed to initialize Gemini AI client due to API key retrieval issues.");
  }
}

// Main POST handler for your API route
export async function POST(req: NextRequest) {
  try {
    // Get the Gemini client (which handles secret retrieval and caching internally)
    const geminiClient = await getGeminiClient();

    const { places } = await req.json();

    if (!places || !Array.isArray(places)) {
      return NextResponse.json({ message: 'Invalid input: "places" array is required.' }, { status: 400 });
    }

    // Build a concise list of places for Gemini
    const placeDescriptions = places.map((p: any) => {
      let desc = `- ${p.name} (${p.types?.join(', ') || 'place'})`;
      if (p.rating) {
        desc += ` - Rating: ${p.rating}`;
      }
      return desc;
    }).join('\n');

    const prompt = `
    You are an expert travel guide. I have a list of nearby bars and restaurants from Google Maps.
    Please provide a concise, engaging summary and recommend a few highlights from this list.
    Focus on places that seem popular or highly rated.

    Here is the list of places:
    ${placeDescriptions}

    Based on these, give me a short, friendly recommendation. If no places are provided, say "No specific recommendations available right now for this area."
    Example output: "Around here, you'll find great spots like [Name 1] for cocktails and [Name 2] for delicious dinner. Don't miss [Name 3] if you're looking for..."
    `;

    const model = geminiClient.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ recommendation: text }, { status: 200 });

  } catch (error) {
    console.error("Error in Gemini API route:", error);
    // Be careful not to expose sensitive error details to the client in production
    return NextResponse.json(
      { message: (error instanceof Error) ? error.message : 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}