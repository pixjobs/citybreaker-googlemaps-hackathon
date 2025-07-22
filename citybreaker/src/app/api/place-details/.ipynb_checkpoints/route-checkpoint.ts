// src/app/api/place-details/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';

const MAPS_SECRET = 'projects/934477100130/secrets/maps-api-key/versions/latest';
const smClient = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
  const [version] = await smClient.accessSecretVersion({ name });
  return version.payload?.data?.toString() || '';
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: 'Missing place name' }, { status: 400 });

    const apiKey = await getSecret(MAPS_SECRET);
    if (!apiKey) return NextResponse.json({ error: 'Maps API key unavailable' }, { status: 500 });

    // Step 1: Text Search to get place_id
    const searchRes = await fetch(`${TEXT_SEARCH_URL}?query=${encodeURIComponent(name)}&key=${apiKey}`);
    const searchJson = await searchRes.json();
    const placeId = searchJson?.results?.[0]?.place_id;

    if (!placeId) return NextResponse.json({ error: 'Place not found' }, { status: 404 });

    // Step 2: Details API to get rich info
    const detailsUrl = `${DETAILS_URL}?place_id=${placeId}&fields=editorial_summary,rating,reviews,website,photos&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsJson = await detailsRes.json();
    const result = detailsJson?.result;

    // Step 3: Build photo URL if available
    const photoRef = result?.photos?.[0]?.photo_reference;
    const photoUrl = photoRef ? `${PHOTO_URL}?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}` : undefined;

    return NextResponse.json({
      rating: result?.rating,
      website: result?.website,
      editorial_summary: result?.editorial_summary,
      reviews: result?.reviews,
      photoUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Place details fetch failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}