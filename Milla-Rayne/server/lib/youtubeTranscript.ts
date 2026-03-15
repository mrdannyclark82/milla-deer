import { createRequire } from 'module';

export interface TranscriptEntry {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
}

interface YoutubeTranscriptApi {
  fetchTranscript(
    videoId: string,
    options?: Record<string, unknown>
  ): Promise<TranscriptEntry[]>;
}

const require = createRequire(import.meta.url);

function resolveTranscriptApi(): YoutubeTranscriptApi {
  const specs = [
    'youtube-transcript',
    'youtube-transcript/dist/youtube-transcript.common.js',
    '/home/nexus/ogdray/Milla-Deer/node_modules/youtube-transcript/dist/youtube-transcript.common.js',
  ];

  for (const spec of specs) {
    try {
      const transcriptModule = require(spec) as
        | {
            YoutubeTranscript?: YoutubeTranscriptApi;
            fetchTranscript?: YoutubeTranscriptApi['fetchTranscript'];
          }
        | undefined;

      if (transcriptModule?.YoutubeTranscript) {
        return transcriptModule.YoutubeTranscript;
      }

      if (transcriptModule?.fetchTranscript) {
        return { fetchTranscript: transcriptModule.fetchTranscript };
      }
    } catch {
      // Keep probing fallback entrypoints.
    }
  }

  throw new Error(
    'youtube-transcript is installed but did not expose a usable fetchTranscript API'
  );
}

export async function fetchYoutubeTranscript(
  videoId: string
): Promise<TranscriptEntry[]> {
  const transcriptApi = resolveTranscriptApi();
  return transcriptApi.fetchTranscript(videoId);
}
