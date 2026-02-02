import { describe, it, expect, vi } from 'vitest';
import { voiceService } from '../voiceService';

describe('VoiceService - Coqui TTS', () => {
  it('should allow setting provider to coqui', () => {
    voiceService.setProvider('coqui');
    expect(voiceService.getCurrentProvider()).toBe('coqui');
  });

  it('should execute cancel without error when provider is coqui', () => {
    voiceService.setProvider('coqui');

    // We expect this not to throw
    expect(() => voiceService.cancel()).not.toThrow();
  });
});
