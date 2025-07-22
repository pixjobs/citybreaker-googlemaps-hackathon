import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const GEMINI_SECRET_NAME = "projects/845341257082/secrets/gemini-api-key/versions/latest";

let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

interface GeminiCityPitch {
  pitch: string;
  icons: string[];
}

function isValidGeminiResponse(data: unknown): data is GeminiCityPitch {
  return (
    typeof data === "object" &&
    data !== null &&
    "pitch" in data &&
    typeof (data as Record<string, unknown>).pitch === "string" &&
    "icons" in data &&
    Array.isArray((data as Record<string, unknown>).icons) &&
    (data as Record<string, unknown>).icons.every((i) => typeof i === "string")
  );
}

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

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) return cachedGeminiClient;

  const apiKey = await getGeminiApiKeyFromSecretManager();
  cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

export async function POST(req: NextRequest) {
  try {
    const { city } = await req.json();
    if (!city || typeof city !== "string") {
      return NextResponse.json({ message: '"city" is required.' }, { status: 400 });
    }

    const prompt = `
You are a creative travel assistant. For the city "${city}", generate a JSON object with two fields:
1. "pitch": one sentence (max 30 words) enticing someone to visit.
2. "icons": an array of 2-3 concise Lucide icon component names (e.g., 'MapPin', 'Coffee', 'Landmark') that best represent the city's vibe.
Respond with only the JSON.`;

    const client = await getGeminiClient();
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8 },
    });

    let raw = result.response.text().trim();

    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error("Parse error", err, raw);
      return NextResponse.json({ message: "Malformed JSON from Gemini" }, { status: 500 });
    }

    if (!isValidGeminiResponse(data)) {
      return NextResponse.json({ message: "Invalid structure returned from Gemini." }, { status: 500 });
    }

    return NextResponse.json({ pitch: data.pitch, icons: data.icons }, { status: 200 });

  } catch (error) {
    console.error("Gemini generation failed:", error);
    return NextResponse.json({ message: "Gemini generation failed." }, { status: 500 });
  }
}
