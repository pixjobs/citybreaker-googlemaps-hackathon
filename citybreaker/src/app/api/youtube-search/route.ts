import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();

async function getYoutubeApiKey(): Promise<string> {
  const [version] = await secretClient.accessSecretVersion({
    name: 'projects/934477100130/secrets/YOUTUBE_API_KEY/versions/latest',
  });

  const payload = version.payload?.data?.toString();
  if (!payload) throw new Error('Secret has no payload');
  return payload;
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const apiKey = await getYoutubeApiKey();

    const youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });

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

  } catch (error: any) {
    console.error('YouTube API Error:', error);
    if (error.code === 403) {
      return NextResponse.json({
        error: 'YouTube API request forbidden. Check API key access or quota.',
      }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch YouTube videos' }, { status: 500 });
  }
}
