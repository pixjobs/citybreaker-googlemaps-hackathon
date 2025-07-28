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

// --- FIX: A more robust and readable type guard function ---
function isValidGeminiResponse(data: unknown): data is GeminiCityPitch {
  // 1. Ensure it's a non-null object
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  // 2. Cast to a record to safely check properties
  const obj = data as Record<string, unknown>;

  // 3. Check for the 'pitch' property and its type
  const hasPitch = typeof obj.pitch === 'string';
  
  // 4. Check for the 'icons' property and its type (an array)
  const hasIcons = Array.isArray(obj.icons);

  if (!hasPitch || !hasIcons) {
    return false;
  }

  // 5. If 'icons' is an array, check if all its elements are strings.
  // This is now safe because we've confirmed `obj.icons` is an array.
  return (obj.icons as unknown[]).every((item) => typeof item === 'string');
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
      // --- IMPROVEMENT: Explicitly request JSON to make the response more reliable ---
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8
      },
    });

    const rawText = result.response.text();
    let data: unknown;

    try {
      data = JSON.parse(rawText);
    } catch (err) {
      console.error("Failed to parse Gemini JSON response:", rawText, err);
      // Fallback: try to clean up markdown just in case
      const cleanedText = rawText.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      try {
        data = JSON.parse(cleanedText);
      } catch (finalErr) {
        console.error("Final parse attempt failed:", cleanedText, finalErr);
        return NextResponse.json({ message: "Malformed JSON from Gemini after cleanup" }, { status: 500 });
      }
    }

    if (!isValidGeminiResponse(data)) {
      console.error("Invalid structure from Gemini:", data);
      return NextResponse.json({ message: "Invalid structure returned from Gemini." }, { status: 500 });
    }

    return NextResponse.json({ pitch: data.pitch, icons: data.icons }, { status: 200 });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Gemini generation failed:", message);
    return NextResponse.json({ message: "Gemini generation failed." }, { status: 500 });
  }
}