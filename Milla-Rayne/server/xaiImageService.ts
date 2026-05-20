import OpenAI from 'openai';

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

let xaiClient: OpenAI | null = null;

function getXAIClient(): OpenAI | null {
  if (!xaiClient && process.env.XAI_API_KEY) {
    xaiClient = new OpenAI({
      baseURL: 'https://api.x.ai/v1',
      apiKey: process.env.XAI_API_KEY,
    });
  }
  return xaiClient;
}

export async function generateImageWithXAI(
  prompt: string,
  options: { n?: number } = {}
): Promise<ImageGenerationResult> {
  const client = getXAIClient();
  if (!client) {
    return { success: false, error: 'XAI_API_KEY not set.' };
  }

  try {
    const response = await client.images.generate({
      model: 'aurora',
      prompt,
      n: options.n ?? 1,
    } as any);

    const url = response.data?.[0]?.url;
    if (!url) {
      return { success: false, error: 'xAI Aurora returned no image URL.' };
    }

    return { success: true, imageUrl: url };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[xaiImageService] Aurora generation failed:', msg);
    return { success: false, error: msg };
  }
}
