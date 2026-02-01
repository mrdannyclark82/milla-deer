import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';

// Default to a local Coqui TTS server or a placeholder
const COQUI_TTS_API_URL = process.env.COQUI_TTS_API_URL || 'http://localhost:5002/api/tts';

// Cache for generated speech files (500 files, ~50MB max, 7-day TTL)
const speechCache = new LRUCache<string, string>({
  max: 500,
  maxSize: 50 * 1024 * 1024, // 50MB max cache size
  sizeCalculation: () => 10 * 1024, // ~10KB per audio file average
  ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
});

/**
 * Generates speech from text using a Coqui TTS server and saves it to a public file.
 * @param text The text to convert to speech.
 * @param voiceId Optional voice/speaker ID.
 * @returns The public URL of the generated audio file.
 */
export async function generateCoquiSpeech(
  text: string,
  voiceId?: string
): Promise<string | null> {
  const speakerId = voiceId || 'female_en'; // Default speaker

  // Create a hash of the text + voice settings to use as cache key
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${text}:${speakerId}:coqui`)
    .digest('hex');

  // Check cache first
  const cachedFile = speechCache.get(cacheKey);
  if (cachedFile) {
    console.log(`[Coqui] Voice cache hit for text: "${text.substring(0, 50)}..."`);

    // Verify file still exists
    const audioDir = path.resolve(process.cwd(), 'client', 'public', 'audio', 'coqui');
    const fileName = cachedFile.split('/').pop();
    if (fileName) {
       const audioFilePath = path.join(audioDir, fileName);
       if (fs.existsSync(audioFilePath)) {
         return cachedFile;
       } else {
         // File was deleted, remove from cache
         console.log(`[Coqui] Cached file no longer exists, regenerating...`);
         speechCache.delete(cacheKey);
       }
    }
  }

  console.log(`[Coqui] Voice cache miss for text: "${text.substring(0, 50)}..."`);

  try {
    // Attempt to call the Coqui TTS API
    // Note: This assumes a standard Coqui HTTP server API
    const response = await fetch(COQUI_TTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/wav', // Coqui often returns wav
      },
      body: JSON.stringify({
        text: text,
        speaker_id: speakerId,
        language_id: 'en', // Defaulting to English
      }),
    });

    if (!response.ok) {
      console.error(
        `[Coqui] API request failed with status: ${response.status} ${response.statusText}`
      );
      // Try to read error body
      try {
        const errBody = await response.text();
        console.error(`[Coqui] Error details: ${errBody}`);
      } catch (e) {
        // ignore
      }
      return null;
    }

    const audioBuffer = await response.buffer();

    // Ensure directory exists
    const audioDir = path.resolve(process.cwd(), 'client', 'public', 'audio', 'coqui');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Use hash as filename for consistent cache hits
    // Coqui often returns WAV, but let's check content type or default to wav
    const contentType = response.headers.get('content-type');
    const extension = contentType?.includes('mpeg') ? 'mp3' : 'wav';

    const audioFileName = `${cacheKey}.${extension}`;
    const audioFilePath = path.join(audioDir, audioFileName);

    fs.writeFileSync(audioFilePath, audioBuffer);

    const publicUrl = `/audio/coqui/${audioFileName}`;

    // Store in cache
    speechCache.set(cacheKey, publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('[Coqui] Service error:', error);
    return null;
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getCoquiSpeechCacheStats() {
  return {
    size: speechCache.size,
    maxSize: speechCache.max,
    calculatedSize: speechCache.calculatedSize,
  };
}
