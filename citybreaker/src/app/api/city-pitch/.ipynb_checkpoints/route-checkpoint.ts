// src/app/api/city-pitch/route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const GEMINI_SECRET_NAME = "projects/845341257082/secrets/gemini-api-key/versions/latest";
let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

// --- Get API key from Secret Manager or env ---
async function getGeminiApiKeyFromSecretManager(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

  if (process.env.NODE_ENV === "development" && process.env.GEMINI_API_KEY) {
    cachedGeminiApiKey = process.env.GEMINI_API_KEY;
    return cachedGeminiApiKey;
  }

  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: GEMINI_SECRET_NAME });
  const payload = version.payload?.data?.toString();
  if (!payload) throw new Error("Secret payload is empty.");
  cachedGeminiApiKey = payload;
  return payload;
}

// --- Get Gemini client instance ---
async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) return cachedGeminiClient;
  const apiKey = await getGeminiApiKeyFromSecretManager();
  cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

// --- API Route Handler ---
export async function POST(req: NextRequest) {
  try {
    const { city } = await req.json();

    if (!city || typeof city !== "string") {
      return NextResponse.json({ message: '"city" is required.' }, { status: 400 });
    }

    const prompt = `
You are a witty and poetic travel pitch writer. Write a one-sentence sales pitch to entice someone to visit "${city}". Be creative, elegant, and no more than 30 words. Output only the pitch text, no formatting or labels.
`;

    const client = await getGeminiClient();
    const model = client.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9 },
    });

    const text = result.response.text().trim();

    const cleaned = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""); // Remove wrapping quotes if present

    return NextResponse.json({ pitch: cleaned }, { status: 200 });
  } catch (error) {
    console.error("❌ Failed to generate city pitch:", error);
    return NextResponse.json(
      { message: "Gemini generation failed or timed out." },
      { status: 500 }
    );
  }
}
