import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./veniceImageService', () => ({
  generateImageWithVenice: vi.fn(),
}));
vi.mock('./pollinationsImageService', () => ({
  generateImageWithPollinations: vi.fn(),
}));
vi.mock('./googleImageService', () => ({
  generateImageWithGoogle: vi.fn(),
}));
vi.mock('./huggingfaceMcpService.ts', () => ({
  getHuggingFaceMCPService: vi.fn(() => null),
}));
vi.mock('@huggingface/inference', () => ({
  InferenceClient: vi.fn().mockImplementation(() => ({
    textToImage: vi.fn(),
  })),
}));

import { config } from './config';
import { generateImageWithGoogle } from './googleImageService';
import { generateImageWithPollinations } from './pollinationsImageService';
import {
  generateImage,
  isLikelyUnsupportedHuggingFaceImageModel,
} from './imageService';

describe('imageService Hugging Face model compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.huggingface.apiKey = '';
    config.huggingface.model = 'stabilityai/stable-diffusion-2-1';
    config.venice.apiKey = '';
    config.google.genAiApiKey = '';
    vi.mocked(generateImageWithGoogle).mockResolvedValue({
      success: false,
      error: 'Google unavailable',
    } as any);
  });

  it('flags LoRA-style model ids as unsupported direct inference backends', () => {
    expect(
      isLikelyUnsupportedHuggingFaceImageModel(
        'burnerbaby/hmfemme-realistic-1girl-lora-for-qwen'
      )
    ).toBe(true);
  });

  it('allows standalone text-to-image models', () => {
    expect(
      isLikelyUnsupportedHuggingFaceImageModel(
        'stabilityai/stable-diffusion-2-1'
      )
    ).toBe(false);
  });

  it('falls back to pollinations when Hugging Face is not configured', async () => {
    vi.mocked(generateImageWithPollinations).mockResolvedValue({
      success: true,
      imageUrl: 'https://image.pollinations.ai/test.png',
    } as any);

    const result = await generateImage('forest spirit portrait');

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe('https://image.pollinations.ai/test.png');
  });

  it('falls back to pollinations for unsupported HF adapter models', async () => {
    config.huggingface.apiKey = 'hf_test';
    config.huggingface.model = 'burnerbaby/hmfemme-realistic-1girl-lora-for-qwen';
    vi.mocked(generateImageWithPollinations).mockResolvedValue({
      success: true,
      imageUrl: 'https://image.pollinations.ai/adapter-fallback.png',
    } as any);

    const result = await generateImage('cyberpunk milla');

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe(
      'https://image.pollinations.ai/adapter-fallback.png'
    );
  });

  it('prefers Google image generation when available', async () => {
    vi.mocked(generateImageWithGoogle).mockResolvedValue({
      success: true,
      imageUrl: 'data:image/png;base64,google-image',
    } as any);

    const result = await generateImage('robot holding a red skateboard');

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe('data:image/png;base64,google-image');
    expect(generateImageWithPollinations).not.toHaveBeenCalled();
  });
});
