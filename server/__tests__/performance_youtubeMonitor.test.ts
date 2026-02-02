import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeTopNews, DailyNewsDigest } from '../youtubeNewsMonitor';

// Mock millAlyzer to simulate delay
vi.mock('../youtubeMillAlyzer', () => ({
  analyzeVideoWithMillAlyzer: vi.fn(async (videoId: string) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      videoId,
      title: 'Mock Title',
      type: 'tutorial',
      keyPoints: [],
      actionableItems: [],
      codeSnippets: [],
      cliCommands: [],
      summary: 'Mock Summary',
      analysisDate: new Date().toISOString(),
      transcriptAvailable: true,
    };
  }),
}));

// Mock knowledge base
vi.mock('../youtubeKnowledgeBase', () => ({
  saveToKnowledgeBase: vi.fn(async () => {
    return true;
  }),
}));

describe('Performance Benchmark: youtubeNewsMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('measures execution time of analyzeTopNews', async () => {
    const digest: DailyNewsDigest = {
      date: '2023-01-01',
      categories: {},
      topStories: Array(5).fill(null).map((_, i) => ({
        videoId: `vid-${i}`,
        title: `Video ${i}`,
        channel: 'Channel',
        publishedAt: '2023-01-01',
        category: 'Tech',
        relevanceScore: 100,
      })),
      totalVideos: 5,
      analysisCount: 0,
    };

    const start = performance.now();
    await analyzeTopNews(digest, 'user-1', 5);
    const end = performance.now();

    const duration = end - start;
    console.log(`Execution time for 5 videos: ${duration.toFixed(2)}ms`);

    expect(duration).toBeGreaterThan(0);
  });
});
