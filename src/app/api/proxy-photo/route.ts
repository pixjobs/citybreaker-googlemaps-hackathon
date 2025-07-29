// src/app/api/proxy-photo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let cachedSecret: string | null = null;
const secretName = 'projects/934477100130/secrets/places-api-key/versions/latest';

async function accessSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const client = new SecretManagerServiceClient();
  try {
    const [version] = await client.accessSecretVersion({ name: secretName });
    const payload = version.payload?.data?.toString();
    if (!payload) throw new Error('Secret payload is empty.');
    cachedSecret = payload;
    return payload;
  } catch (error) {
    console.error('Failed to access secret from Secret Manager:', error);
    throw new Error('Could not access the secret.');
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const placeId = searchParams.get('placeid');
  const maxWidthPx = searchParams.get('maxwidth') || '400';

  if (!placeId) {
    return new NextResponse("Missing 'placeid' parameter.", { status: 400 });
  }

  try {
    const apiKey = await accessSecret();

    // Step 1: Get Place Details to retrieve the photo resource name
    const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}?fields=photos&key=${apiKey}`;
    const detailsResponse = await fetch(detailsUrl);

    if (!detailsResponse.ok) {
      console.error('Failed to fetch place details:', await detailsResponse.text());
      return new NextResponse('Failed to fetch place details.', { status: 500 });
    }

    const detailsData = await detailsResponse.json();
    const photoName = detailsData.photos?.[0]?.name;

    if (!photoName) {
      return new NextResponse('No photo found for this place.', { status: 404 });
    }

    // Step 2: Fetch the actual photo using the new media endpoint
    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${apiKey}`;
    const mediaResponse = await fetch(mediaUrl);

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error('Failed to fetch photo:', mediaResponse.status, errorText);
      return new NextResponse(errorText, { status: mediaResponse.status });
    }

    const contentType = mediaResponse.headers.get('content-type') || 'image/jpeg';
    const body = mediaResponse.body as ReadableStream<Uint8Array>;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });

  } catch (err) {
    console.error('Proxy route handler failed:', err);
    return new NextResponse('Internal Server Error.', { status: 500 });
  }
}
