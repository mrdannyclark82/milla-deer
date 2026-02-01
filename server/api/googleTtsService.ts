import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { config } from '../config';

// Cache for generated speech files (500 files, ~50MB max, 7-day TTL)
const speechCache = new LRUCache<string, string>({
  max: 500,
  maxSize: 50 * 1024 * 1024, // 50MB max cache size
  sizeCalculation: () => 10 * 1024, // ~10KB per audio file average
  ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
});

interface GoogleTtsConfig {
  rate?: number;
  pitch?: number;
}

/**
 * Generates speech from text using the Google Cloud TTS API and saves it to a public file.
 * @param text The text to convert to speech.
 * @param voiceName The voice name to use (e.g., 'en-US-Neural2-C').
 * @param config Voice configuration (rate, pitch).
 * @returns The file path of the generated audio file (relative to public dir) or null if failed.
 */
export async function generateGoogleCloudSpeech(
  text: string,
  voiceName: string = 'en-US-Neural2-C',
  voiceConfig: GoogleTtsConfig = {}
): Promise<string | null> {
  if (!config.google.ttsApiKey) {
    console.error('Google Cloud TTS API key is not configured.');
    return null;
  }

  // Create a hash of the text + voice settings to use as cache key
  const rate = voiceConfig.rate ?? 1.0;
  const pitch = voiceConfig.pitch ?? 0.0;

  const cacheKey = crypto
    .createHash('sha256')
    .update(`${text}:${voiceName}:${rate}:${pitch}`)
    .digest('hex');

  // Check cache first
  const cachedFile = speechCache.get(cacheKey);
  if (cachedFile) {
    console.log(`Google TTS cache hit for text: "${text.substring(0, 50)}..."`);

    // Verify file still exists
    const audioDir = path.resolve(process.cwd(), 'client', 'public', 'audio');
    const audioFilePath = path.join(
      audioDir,
      cachedFile.replace('/audio/', '')
    );

    if (fs.existsSync(audioFilePath)) {
      return cachedFile;
    } else {
      // File was deleted, remove from cache
      console.log(`Cached file no longer exists, regenerating...`);
      speechCache.delete(cacheKey);
    }
  }

  console.log(`Google TTS cache miss for text: "${text.substring(0, 50)}..."`);

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.google.ttsApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: pitch,
          speakingRate: rate,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `Google Cloud TTS API request failed with status: ${response.status} - ${errorText}`
    );
    return null;
  }

  const data: any = await response.json();

  if (!data.audioContent) {
    console.error('Google Cloud TTS API did not return audioContent');
    return null;
  }

  const audioBuffer = Buffer.from(data.audioContent, 'base64');
  const audioDir = path.resolve(process.cwd(), 'client', 'public', 'audio');

  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  // Use hash as filename for consistent cache hits
  const audioFileName = `google_${cacheKey}.mp3`;
  const audioFilePath = path.join(audioDir, audioFileName);

  fs.writeFileSync(audioFilePath, audioBuffer);

  const publicUrl = `/audio/${audioFileName}`;

  // Store in cache
  speechCache.set(cacheKey, publicUrl);

  return publicUrl;
}
