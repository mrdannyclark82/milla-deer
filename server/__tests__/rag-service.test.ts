import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGService } from '../rag-service';
import * as vectorDbService from '../vector-db-service';

// Mock vector-db-service
vi.mock('../vector-db-service', () => ({
  getVectorDB: vi.fn(),
  initializeVectorDB: vi.fn(),
}));

describe('RAGService', () => {
  let ragService: RAGService;
  let mockVectorDB: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVectorDB = {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    (vectorDbService.getVectorDB as any).mockReturnValue(mockVectorDB);

    ragService = new RAGService();
  });

  it('should ingest documents correctly', async () => {
    const documents = [
      {
        id: 'doc1',
        content: 'This is a test document.',
        metadata: { source: 'test' },
      },
    ];

    await ragService.ingestDocuments(documents);

    expect(mockVectorDB.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockVectorDB.upsert.mock.calls[0][0];

    expect(upsertArgs.length).toBeGreaterThan(0);
    expect(upsertArgs[0]).toHaveProperty('id');
    expect(upsertArgs[0].id).toContain('doc1');
    expect(upsertArgs[0]).toHaveProperty('values');
    expect(Array.isArray(upsertArgs[0].values)).toBe(true);
    expect(upsertArgs[0].metadata).toHaveProperty('documentId', 'doc1');
  });

  it('should preserve chunk order', async () => {
    // Use a small chunk size to force multiple chunks
    // The RAGService constructor args are (chunkSize, chunkOverlap)
    ragService = new RAGService(10, 0);

    const content = 'chunk1 chunk2 chunk3';
    // The simple chunker splits by separators, so ' ' will be split points.

    await ragService.ingestDocuments([{ id: 'doc2', content }]);

    const upsertArgs = mockVectorDB.upsert.mock.calls[0][0];

    // Verify we have multiple chunks
    expect(upsertArgs.length).toBeGreaterThan(1);

    // Verify indices are correct and ordered
    for (let i = 0; i < upsertArgs.length; i++) {
      expect(upsertArgs[i].metadata.chunkIndex).toBe(i);
    }
  });
});
