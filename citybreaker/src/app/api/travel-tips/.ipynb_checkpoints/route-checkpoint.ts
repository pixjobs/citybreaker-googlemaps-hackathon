// src/app/api/travel-tips/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// ... (Your getGeminiApiKeyFromSecretManager and getGeminiClient functions remain the same)

export async function POST(req: NextRequest) {
  console.log("\n--- ✈️ New Travel Tips Request Received ---");

  try {
    const geminiClient = await getGeminiClient();
    const { destination } = await req.json();
    console.log(`➡️ [Input] Received destination: ${destination}`);

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
    }

    const prompt = `
You are a witty, savvy travel expert for "${destination}". Generate three distinct, useful, and fun tips for a first-time visitor.

**Instructions:**
- Provide ONE tip for each category: 'Airport', 'Transport', and 'Fun Fact'.
- Each tip should be a single, concise sentence.
- **CRITICAL:** Your entire response MUST be a single, valid JSON array of objects. Do not include any text or markdown formatting before or after the JSON.

**JSON Structure Example:**
[
  {
    "icon": "✈️",
    "title": "Airport Tip",
    "text": "From JFK, the AirTrain to the subway is cheap, but a cab has a flat rate if you're feeling fancy."
  },
  {
    "icon": "🚇",
    "title": "Transport Tip",
    "text": "The NYC subway runs 24/7, but Manhattan's grid system makes it one of the most walkable cities in the world."
  },
  {
    "icon": "💡",
    "title": "Did You Know?",
    "text": "The New York Public Library is guarded by two marble lions named Patience and Fortitude."
  }
]
`;

    console.log("🟡 [Gemini] Sending prompt for travel tips...");
    const model = geminiClient.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("✅ [Gemini] Successfully received response.");

    const tips = JSON.parse(text);

    return NextResponse.json({ tips }, { status: 200 });

  } catch (error) {
    console.error("❌ [Error] Travel Tips POST handler failed:", error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}