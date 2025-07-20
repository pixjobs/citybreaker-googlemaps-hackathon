// File: src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const SECRET_NAME = 'projects/845341257082/secrets/gemini-api-key/versions/latest';
let cachedKey: string;
let cachedClient: GoogleGenerativeAI;

async function getClient(): Promise<GoogleGenerativeAI> {
  if (cachedClient) return cachedClient;
  if (!cachedKey) {
    const sm = new SecretManagerServiceClient();
    const [version] = await sm.accessSecretVersion({ name: SECRET_NAME });
    cachedKey = version.payload?.data?.toString()!;
  }
  cachedClient = new GoogleGenerativeAI(cachedKey);
  return cachedClient;
}

/**
 * Generate a Markdown itinerary for a given city and list of places.
 * Returns raw Markdown including PHOTO_SUGGESTION tags for image lookup.
 */
export async function getMarkdown(
  places: { name: string }[],
  tripLength: number,
  cityName: string
): Promise<string> {
  const days = Math.min(Math.max(tripLength, 3), 7);
  const list = places.map((p) => `- ${p.name}`).join('\n');
  const prompt = `Generate a ${days}-day Markdown itinerary for ${cityName}.\nEach day: ### Day N: Title [PHOTO_SUGGESTION: "Place Name"]. Use 2–4 of these places:\n${list}`;

  const client = await getClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-lite-preview-06-17' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 },
  });

  return await result.response.text();
}
