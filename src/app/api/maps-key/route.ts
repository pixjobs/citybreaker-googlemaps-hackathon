import { NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let cachedSecret: string | null = null;

const secretName = 'projects/934477100130/secrets/maps-api-key/versions/latest';

async function accessSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  const client = new SecretManagerServiceClient();

  try {
    const [version] = await client.accessSecretVersion({
      name: secretName,
    });

    const payload = version.payload?.data?.toString();

    if (!payload) {
      console.error('Secret payload is empty.');
      throw new Error('Failed to retrieve secret: Payload is empty.');
    }

    cachedSecret = payload;
    return payload;
  } catch (error) {
    // The specific error is logged here for debugging on the server.
    console.error('Failed to access secret from Secret Manager:', error);
    // A generic error is re-thrown to be handled by the API route.
    throw new Error('Could not access the secret.');
  }
}

export async function GET() {
  try {
    const apiKey = await accessSecret();
    return NextResponse.json({ apiKey });
  } catch (error) {

    console.error('API route handler caught an error:', error);
    
    // Return a generic error message to the client for security reasons.
    return new NextResponse('Internal Server Error: Could not retrieve API key.', { status: 500 });
  }
}