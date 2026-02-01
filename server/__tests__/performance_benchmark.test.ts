import { describe, it, expect, vi, beforeAll } from 'vitest';
import { SqliteStorage } from '../sqliteStorage';
import type { InsertYoutubeKnowledge } from '@shared/schema';

describe('Performance Benchmark: semanticSearchVideos', () => {
  const NUM_VIDEOS = 1000;
  let semanticSearchVideos: typeof import('../youtubeKnowledgeBase').semanticSearchVideos;
  let testStorage: SqliteStorage;
  const mockVectorResults: any[] = [];

  beforeAll(async () => {
    testStorage = new SqliteStorage(':memory:');

    // Mock storage
    vi.doMock('../storage', () => ({
      storage: testStorage,
    }));

    // Mock vectorDB
    vi.doMock('../vectorDBService', () => ({
      vectorDB: {
        semanticSearch: vi
          .fn()
          .mockImplementation(async () => mockVectorResults),
        addContent: vi.fn(),
      },
    }));

    // Import module under test
    const mod = await import('../youtubeKnowledgeBase');
    semanticSearchVideos = mod.semanticSearchVideos;

    // Populate
    for (let i = 0; i < NUM_VIDEOS; i++) {
      const videoId = `video-${i}`;
      const video: InsertYoutubeKnowledge = {
        videoId,
        title: `Video Title ${i}`,
        videoType: 'tutorial',
        summary: `Summary for video ${i}`,
        transcriptAvailable: true,
        userId: 'default-user',
      };

      await testStorage.saveYoutubeKnowledge(video);

      mockVectorResults.push({
        entry: {
          metadata: { videoId },
        },
        similarity: 0.9,
      });
    }
  });

  it('measures execution time of semanticSearchVideos', async () => {
    const start = performance.now();
    const results = await semanticSearchVideos('test query', {
      userId: 'default-user',
      topK: NUM_VIDEOS,
    });
    const end = performance.now();
    const duration = end - start;

    console.log(`\n\n⚡ Benchmark Results:`);
    console.log(`Querying ${NUM_VIDEOS} videos took ${duration.toFixed(2)}ms`);
    console.log(`Found ${results.length} videos\n`);

    expect(results.length).toBe(NUM_VIDEOS);
  });
});
