// src/app/api/youtube-search/route.ts
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const youtube = google.youtube({
  version: 'v3',
  // --- THIS IS THE ONLY CHANGE ---
  // We now use the same key as your Google Maps setup.
  auth: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const response = await youtube.search.list({
      part: ['snippet'],
      q: `${query} tour guide`,
      type: ['video'],
      maxResults: 6,
    });

    const videos = response.data.items?.map(item => ({
      id: item.id?.videoId,
      title: item.snippet?.title,
      thumbnail: item.snippet?.thumbnails?.high?.url,
      channelTitle: item.snippet?.channelTitle,
    })) || [];

    return NextResponse.json({ videos });

  } catch (error) {
    console.error('YouTube API Error:', error);
    // This will help you debug if the key has issues with the YouTube API
    if (error.code === 403) {
        return NextResponse.json({ error: 'YouTube API request forbidden. Check if the API is enabled for your key.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch YouTube videos' }, { status: 500 });
  }
}