import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// --- Config ---
const GEMINI_SECRET_NAME = "projects/845341257082/secrets/gemini-api-key/versions/latest";
let cachedGeminiApiKey: string | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;

// --- Secret Manager / Dev Key Fallback ---
async function getGeminiApiKeyFromSecretManager(): Promise<string> {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

  // DEV MODE fallback
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

// --- Gemini Client Init ---
async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (cachedGeminiClient) return cachedGeminiClient;
  const apiKey = await getGeminiApiKeyFromSecretManager();
  cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  return cachedGeminiClient;
}

// --- POST Handler ---
export async function POST(req: NextRequest) {
  console.log("\n--- ✨ New RICH Travel Tips Request Received ---");

  try {
    const geminiClient = await getGeminiClient();
    const { destination } = await req.json();
    console.log(`➡️ [Input] Destination: ${destination}`);

    if (!destination || typeof destination !== "string") {
      return NextResponse.json(
        { message: 'Invalid input: "destination" string is required.' },
        { status: 400 }
      );
    }

    const prompt = `
You are a world-class travel journalist and a savvy local guide for "${destination}". Your task is to generate a "rich welcome card" for a first-time visitor.

**Instructions:**
- Your entire response MUST be a single, valid JSON object. Do not include any text, markdown, or code fences before or after the JSON.
- Be creative, concise, and insightful.

**Generate the following fields in your JSON response:**
1. "intro": A single, captivating welcome sentence that sets the scene.
2. "vibeKeywords": An array of 3-4 single-word strings describing the city's atmosphere.
3. "mustDo": A short description of one iconic, can't-miss activity. 
4. "hiddenGem": A description of a lesser-known spot or experience that offers a unique local perspective.
5. "foodieTip": A recommendation for a worthy meal, drink or food market to try - keep to the local traditions but take the week day and month of the year into consideration.
`;

    const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-06-17" });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 sec timeout

    let result;
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      });
    } catch (timeoutError) {
      console.error("⏰ Timeout or Gemini error:", timeoutError);
      return NextResponse.json({ message: "Gemini model timed out or failed." }, { status: 504 });
    } finally {
      clearTimeout(timeoutId);
    }

    const raw = result.response.text().trim();

    // Strip markdown-style code fences if present
    let cleaned = raw;
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
    }

    let richData;
    try {
      richData = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("❌ Failed to parse Gemini response as JSON:", parseErr);
      console.warn("🧾 Raw Gemini output:", cleaned);
      return NextResponse.json({ message: "Gemini returned malformed JSON." }, { status: 500 });
    }

    console.log("✅ Successfully parsed rich data:", richData);
    return NextResponse.json(richData, { status: 200 });

  } catch (error) {
    console.error("❌ Unexpected server error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unknown server error." },
      { status: 500 }
    );
  }
}
