import { Message, ToolMode } from '../types';

const MILLA_SERVER = import.meta.env.VITE_MILLA_SERVER ?? 'http://localhost:5000';
const INTERNAL_KEY = import.meta.env.VITE_INTERNAL_KEY ?? '';

export interface MillaResponse {
  response: string;
  success: boolean;
  imageUrl?: string;
  youtube_play?: { videoId: string; title: string };
}

export async function sendToMilla(
  message: string,
  tool: ToolMode,
  imageData?: string
): Promise<Partial<Message>> {
  const body: Record<string, string> = { message };

  if (imageData) body.imageData = imageData;

  // Prefix tool mode so Milla can route appropriately
  const toolPrefixes: Partial<Record<ToolMode, string>> = {
    [ToolMode.IMAGE_GEN]: 'generate an image of: ',
    [ToolMode.VIDEO_GEN]: 'generate a video of: ',
    [ToolMode.CODE]: '```\n',
  };
  const prefix = toolPrefixes[tool];
  if (prefix && tool === ToolMode.IMAGE_GEN) {
    body.message = prefix + message;
  }

  const res = await fetch(`${MILLA_SERVER}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Milla error ${res.status}: ${err}`);
  }

  const data: MillaResponse = await res.json();

  const result: Partial<Message> = {
    role: 'model',
    content: data.response ?? '(no response)',
    timestamp: Date.now(),
  };

  if (data.imageUrl) result.imageUri = data.imageUrl;

  return result;
}
