import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage', () => ({ storage: {} }));
vi.mock('../weatherService', () => ({
  getCurrentWeather: vi.fn(),
  formatWeatherResponse: vi.fn(),
}));
vi.mock('../searchService', () => ({
  performWebSearch: vi.fn(),
  shouldPerformSearch: vi.fn(() => false),
}));
vi.mock('../imageService', () => ({
  generateImage: vi.fn(),
  formatImageResponse: vi.fn(),
  extractImagePrompt: vi.fn(() => null),
}));
vi.mock('../veniceImageService', () => ({ generateImageWithVenice: vi.fn() }));
vi.mock('../memoryService', () => ({
  searchKnowledge: vi.fn(),
  updateMemories: vi.fn(),
  getMemoryCoreContext: vi.fn(async () => '[Danny]: remembered context'),
}));
vi.mock('../visualMemoryService', () => ({
  getVisualMemories: vi.fn(),
  getEmotionalContext: vi.fn(),
}));
vi.mock('../proactiveService', () => ({
  detectEnvironmentalContext: vi.fn(),
}));
vi.mock('../aiDispatcherService', () => ({
  dispatchAIResponse: vi.fn(),
}));
vi.mock('../youtubeAnalysisService', () => ({
  analyzeYouTubeVideo: vi.fn(),
}));
vi.mock('../repositoryAnalysisService', () => ({
  parseGitHubUrl: vi.fn(),
  fetchRepositoryData: vi.fn(),
  generateRepositoryAnalysis: vi.fn(),
}));
vi.mock('../repositoryModificationService', () => ({
  generateRepositoryImprovements: vi.fn(),
  applyRepositoryImprovements: vi.fn(),
}));
vi.mock('../browserIntegrationService', () => ({
  detectBrowserToolRequest: vi.fn(),
  getBrowserToolInstructions: vi.fn(),
}));
vi.mock('../openrouterCodeService', () => ({
  generateCodeWithQwen: vi.fn(),
  formatCodeResponse: vi.fn(),
  extractCodeRequest: vi.fn(() => null),
}));
vi.mock('./repositoryCache.service', () => ({
  repositoryCache: new Map(),
}));
vi.mock('../sanitization', () => ({
  sanitizePromptInput: vi.fn((value: string) => value),
}));
vi.mock('../profileService', () => ({
  getProfile: vi.fn(async () => null),
}));

import { dispatchAIResponse } from '../aiDispatcherService';
import { generateAIResponse } from './chatOrchestrator.service';

describe('chatOrchestrator provider fallback handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.XAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('retries with stripped prompt before giving up when a provider is configured', async () => {
    vi.mocked(dispatchAIResponse)
      .mockResolvedValueOnce({
        success: false,
        content: '',
        error: 'Provider overload',
      })
      .mockResolvedValueOnce({
        success: true,
        content: 'Live provider reply',
      });

    const response = await generateAIResponse(
      'Hey Milla, tell me something nice',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toBe('Live provider reply');
    expect(dispatchAIResponse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dispatchAIResponse).mock.calls[1][0]).toBe(
      'Hey Milla, tell me something nice'
    );
  });

  it('returns a transparent provider error instead of memory fallback when configured providers fail', async () => {
    vi.mocked(dispatchAIResponse).mockResolvedValue({
      success: false,
      content: '',
      error: 'Provider unavailable',
    });

    const response = await generateAIResponse(
      'Tell me something interesting',
      [],
      'Danny Ray',
      undefined,
      'default-user'
    );

    expect(response.content).toContain('live AI provider');
    expect(response.content).not.toContain("That's interesting, Danny Ray");
    expect(dispatchAIResponse).toHaveBeenCalledOnce();
  });
});
