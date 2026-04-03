import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateImageWithPollinations } from './pollinationsImageService';

describe('generateImageWithPollinations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a clear timeout error when the request is aborted', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('Request aborted'), { name: 'AbortError' })
    );

    const result = await generateImageWithPollinations('cyberpunk milla', {
      model: 'flux-3d',
    });

    expect(result).toEqual({
      success: false,
      error: 'Pollinations timed out after 25s.',
    });
  });
});
