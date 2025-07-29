import { NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// It's a good practice to cache the secret to reduce latency and API calls.
let cachedSecret: string | null = null;

// The full name of the secret from Google Secret Manager.
const secretName = 'projects/934477100130/secrets/maps-api-key/versions/latest';

async function accessSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  // Ensure the environment is configured with credentials.
  // This will work automatically in Google Cloud Run if the service account has the correct permissions.
  const client = new SecretManagerServiceClient();

  try {
    const [version] = await client.accessSecretVersion({
      name: secretName,
    });

    // Extract the payload as a string.
    const payload = version.payload?.data?.toString();

    if (!payload) {
      console.error('Secret payload is empty.');
      throw new Error('Failed to retrieve secret: Payload is empty.');
    }

    cachedSecret = payload;
    return payload;
  } catch (error) {
    console.error('Failed to access secret from Secret Manager:', error);
    // Rethrow the error to be handled by the caller
    throw new Error('Could not access the secret.');
  }
}

export async function GET() {
  try {
    const apiKey = await accessSecret();
    return NextResponse.json({ apiKey });
  } catch (error) {
    // Return a generic error message to the client for security reasons.
    return new NextResponse('Internal Server Error: Could not retrieve API key.', { status: 500 });
  }
}