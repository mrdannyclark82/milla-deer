import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatcher } from '../dispatcher';
import { offlineService } from '../offlineModelService';

// Mock offlineService
vi.mock('../offlineModelService', () => ({
  offlineService: {
    isAvailable: vi.fn(),
    generateResponse: vi.fn(),
  },
}));

// Mock agenticDispatch
vi.mock('../agentic-dispatch', () => ({
  agenticDispatch: vi.fn(),
}));

describe('Dispatcher - Gemma Local', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear cache to ensure clean state
    dispatcher.clearCache();
  });

  it('should successfully invoke local gemma model via offlineService', async () => {
    const dispatcherAny = dispatcher as any;

    // Mock availability and success response
    vi.mocked(offlineService.isAvailable).mockReturnValue(true);
    vi.mocked(offlineService.generateResponse).mockResolvedValue({
      content: 'Local Gemma Response',
      success: true,
      usedLocal: true,
    });

    // Test the private method directly for isolation
    const response = await dispatcherAny.invokeModel(
      'gemma-local',
      'test query'
    );

    expect(offlineService.isAvailable).toHaveBeenCalled();
    expect(offlineService.generateResponse).toHaveBeenCalledWith('test query');
    expect(response).toBe('Local Gemma Response');
  });

  it('should throw error if offlineService is not available', async () => {
    const dispatcherAny = dispatcher as any;

    // Mock unavailability
    vi.mocked(offlineService.isAvailable).mockReturnValue(false);

    await expect(
      dispatcherAny.invokeModel('gemma-local', 'test query')
    ).rejects.toThrow('Local Gemma service is not available');
  });

  it('should throw error if offlineService fails generation', async () => {
    const dispatcherAny = dispatcher as any;

    // Mock available but failure in generation
    vi.mocked(offlineService.isAvailable).mockReturnValue(true);
    vi.mocked(offlineService.generateResponse).mockResolvedValue({
      content: '',
      success: false,
      usedLocal: true,
    });

    await expect(
      dispatcherAny.invokeModel('gemma-local', 'test query')
    ).rejects.toThrow('Local Gemma inference failed');
  });

  it('should dispatch to gemma-local when it is the only configured model', async () => {
    const dispatcherAny = dispatcher as any;

    // Save original configuration
    const originalModels = dispatcherAny.models;
    const originalHealth = new Map(dispatcherAny.modelHealth);

    // Configure to only use gemma-local
    dispatcherAny.models = ['gemma-local'];
    dispatcherAny.modelHealth.set('gemma-local', {
      available: true,
      lastCheck: Date.now(),
      failureCount: 0,
    });

    vi.mocked(offlineService.isAvailable).mockReturnValue(true);
    vi.mocked(offlineService.generateResponse).mockResolvedValue({
      content: 'Local Gemma Response via Dispatch',
      success: true,
      usedLocal: true,
    });

    const response = await dispatcher.dispatch('test query via dispatch');

    expect(response).toBe('Local Gemma Response via Dispatch');

    // Restore configuration
    dispatcherAny.models = originalModels;
    dispatcherAny.modelHealth = originalHealth;
  });
});
