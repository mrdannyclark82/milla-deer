import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchAIResponse } from '../aiDispatcherService';
import * as openaiChatService from '../openaiChatService';
import * as anthropicService from '../anthropicService';
import * as xaiService from '../xaiService';
import * as mistralService from '../mistralService';
import * as openrouterService from '../openrouterService';
import * as geminiService from '../geminiService';
import { config } from '../config';

// Mock all dependencies
vi.mock('../openaiChatService', () => ({ generateOpenAIResponse: vi.fn() }));
vi.mock('../anthropicService', () => ({ generateAnthropicResponse: vi.fn() }));
vi.mock('../xaiService', () => ({
  generateXAIResponse: vi.fn(),
  PersonalityContext: {},
}));
vi.mock('../mistralService', () => ({ generateMistralResponse: vi.fn() }));
vi.mock('../openrouterService', () => ({
  generateOpenRouterResponse: vi.fn(),
  generateGrokResponse: vi.fn(),
}));
vi.mock('../geminiService', () => ({ generateGeminiResponse: vi.fn() }));
vi.mock('../authService', () => ({
  getUserAIModel: vi.fn().mockResolvedValue({ success: false }),
}));
vi.mock('../aiModelPreferences', () => ({
  DEFAULT_CHAT_MODEL: 'gemini',
  normalizeAIModel: vi.fn((model: string) => model),
}));
vi.mock('../memoryService', () => ({
  searchMemoryCore: vi.fn().mockResolvedValue([]),
  getSemanticMemoryContext: vi.fn().mockResolvedValue(''),
}));
vi.mock('../xaiTracker', () => ({
  startReasoningSession: vi.fn().mockReturnValue('test-session-id'),
  trackCommandIntent: vi.fn(),
  trackToolSelection: vi.fn(),
  trackResponseGeneration: vi.fn(),
  addReasoningStep: vi.fn(),
}));
describe('AI Dispatcher Priority Chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.localModel = { enabled: false, preferLocal: false };
    config.gemini = { apiKey: 'gemini-test' };
    config.openai = { apiKey: 'sk-test' };
    config.anthropic = { apiKey: 'sk-ant-test' };
    config.xai = { apiKey: 'xai-test' };
    config.mistral = { apiKey: 'mistral-test' };
    config.openrouter = { apiKey: 'or-test', grok1ApiKey: 'grok-test' };
    vi.mocked(geminiService.generateGeminiResponse).mockResolvedValue({
      success: false,
      content: '',
      error: 'Gemini failed',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFail = (mockFn: any) =>
    mockFn.mockResolvedValue({ success: false, error: 'Failed' });
  const mockSuccess = (mockFn: any, name: string) =>
    mockFn.mockResolvedValue({ success: true, content: `${name} Response` });

  it('1. Gemini succeeds -> Stop', async () => {
    mockSuccess(geminiService.generateGeminiResponse as any, 'Gemini');
    await dispatchAIResponse('Try Gemini', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });
    expect(geminiService.generateGeminiResponse).toHaveBeenCalled();
    expect(xaiService.generateXAIResponse).not.toHaveBeenCalled();
  });

  it('2. Gemini fails -> xAI succeeds -> Stop', async () => {
    mockSuccess(xaiService.generateXAIResponse as any, 'xAI');

    await dispatchAIResponse('Try xAI', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });

    expect(geminiService.generateGeminiResponse).toHaveBeenCalled();
    expect(xaiService.generateXAIResponse).toHaveBeenCalled();
    expect(openaiChatService.generateOpenAIResponse).not.toHaveBeenCalled();
  });

  it('3. Gemini/xAI fail -> OpenAI succeeds -> Stop', async () => {
    mockFail(xaiService.generateXAIResponse as any);
    mockSuccess(openaiChatService.generateOpenAIResponse as any, 'OpenAI');

    await dispatchAIResponse('Try OpenAI', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });

    expect(geminiService.generateGeminiResponse).toHaveBeenCalled();
    expect(xaiService.generateXAIResponse).toHaveBeenCalled();
    expect(openaiChatService.generateOpenAIResponse).toHaveBeenCalled();
    expect(anthropicService.generateAnthropicResponse).not.toHaveBeenCalled();
  });

  it('4. Gemini/xAI/OpenAI fail -> Anthropic succeeds -> Stop', async () => {
    mockFail(xaiService.generateXAIResponse as any);
    mockFail(openaiChatService.generateOpenAIResponse as any);
    mockSuccess(anthropicService.generateAnthropicResponse as any, 'Anthropic');

    await dispatchAIResponse('Try Anthropic', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });

    expect(anthropicService.generateAnthropicResponse).toHaveBeenCalled();
    expect(mistralService.generateMistralResponse).not.toHaveBeenCalled();
  });

  it('5. Gemini/xAI/OpenAI/Anthropic fail -> Mistral succeeds', async () => {
    mockFail(xaiService.generateXAIResponse as any);
    mockFail(openaiChatService.generateOpenAIResponse as any);
    mockFail(anthropicService.generateAnthropicResponse as any);
    mockSuccess(mistralService.generateMistralResponse as any, 'Mistral');

    await dispatchAIResponse('Try Mistral', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });

    expect(mistralService.generateMistralResponse).toHaveBeenCalled();
    expect(openrouterService.generateOpenRouterResponse).not.toHaveBeenCalled();
  });

  it('6. No direct providers -> OpenRouter succeeds', async () => {
    config.gemini = { apiKey: '' };
    config.openai = { apiKey: '' };
    config.anthropic = { apiKey: '' };
    config.xai = { apiKey: '' };
    config.mistral = { apiKey: '' };
    mockSuccess(
      openrouterService.generateOpenRouterResponse as any,
      'OpenRouter'
    );

    await dispatchAIResponse('Try OpenRouter', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });

    expect(openrouterService.generateOpenRouterResponse).toHaveBeenCalled();
  });

  it('7. Direct providers configured -> do not auto-fallback to OpenRouter', async () => {
    mockFail(xaiService.generateXAIResponse as any);
    mockFail(mistralService.generateMistralResponse as any);
    mockFail(openaiChatService.generateOpenAIResponse as any);
    mockFail(anthropicService.generateAnthropicResponse as any);
    mockSuccess(
      openrouterService.generateOpenRouterResponse as any,
      'OpenRouter'
    );

    await dispatchAIResponse('Do not use OpenRouter', {
      userId: 'u1',
      conversationHistory: [],
      userName: 'User',
    });

    expect(openrouterService.generateOpenRouterResponse).not.toHaveBeenCalled();
  });
});
