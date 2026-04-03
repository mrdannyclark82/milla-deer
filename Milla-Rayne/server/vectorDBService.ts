/**
 * Vector Database Service
 *
 * Provides semantic embedding generation and similarity search capabilities
 * for Vector-Augmented Retrieval Generation (V-RAG) system.
 *
 * Features:
 * - Generate embeddings using a local Ollama embedding model
 * - Cosine similarity search for semantic retrieval
 * - In-memory vector store with persistence
 * - Support for multiple content types (memory, knowledge, conversations)
 */

import { promises as fs } from 'fs';
import path from 'path';

// ===========================================================================================
// TYPES
// ===========================================================================================

export interface VectorEntry {
  id: string;
  content: string;
  embedding: number[];
  // P2.6: Add summary vector for hierarchical indexing
  summaryVector?: number[]; // Smaller, faster vector for initial filtering
  // P2.2: Add encrypted vector support for HCF
  encryptedEmbedding?: {
    ciphertext: string;
    dimensions: number;
    timestamp: number;
    metadata?: any;
  };
  metadata: {
    type: 'memory' | 'knowledge' | 'conversation' | 'youtube';
    timestamp: string;
    userId?: string;
    [key: string]: any;
  };
}

export interface SearchResult {
  entry: VectorEntry;
  similarity: number;
}

// ===========================================================================================
// VECTOR STORE
// ===========================================================================================

class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();
  private persistencePath: string;
  private isDirty: boolean = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(
    persistencePath: string = path.join(
      process.cwd(),
      'memory',
      'vector_store.json'
    )
  ) {
    this.persistencePath = persistencePath;
    this.loadFromDisk().catch((err) => {
      console.error('Error loading vector store from disk:', err);
    });
  }

  /**
   * Load vector store from disk
   */
  private async loadFromDisk(): Promise<void> {
    try {
      await fs.access(this.persistencePath);
      const data = await fs.readFile(this.persistencePath, 'utf-8');
      const entries: VectorEntry[] = JSON.parse(data);

      entries.forEach((entry) => {
        this.entries.set(entry.id, entry);
      });

      console.log(`✅ Loaded ${entries.length} vectors from disk`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading vector store:', error);
      }
      // File doesn't exist yet - this is fine for first run
    }
  }

  /**
   * Save vector store to disk (batched)
   */
  private async saveToDisk(): Promise<void> {
    if (!this.isDirty) return;

    try {
      const entries = Array.from(this.entries.values());
      const memoryDir = path.dirname(this.persistencePath);

      // Ensure directory exists
      await fs.mkdir(memoryDir, { recursive: true });

      await fs.writeFile(
        this.persistencePath,
        JSON.stringify(entries, null, 2),
        'utf-8'
      );

      this.isDirty = false;
      console.log(`✅ Saved ${entries.length} vectors to disk`);
    } catch (error) {
      console.error('Error saving vector store:', error);
    }
  }

  /**
   * Schedule a save operation (debounced)
   */
  private scheduleSave(): void {
    this.isDirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, 5000); // Save after 5 seconds of inactivity
  }

  /**
   * Add or update a vector entry
   */
  async upsert(entry: VectorEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    this.scheduleSave();
  }

  /**
   * Add multiple vector entries
   */
  async upsertBatch(entries: VectorEntry[]): Promise<void> {
    entries.forEach((entry) => {
      this.entries.set(entry.id, entry);
    });
    this.scheduleSave();
  }

  /**
   * Get a vector entry by ID
   */
  async get(id: string): Promise<VectorEntry | null> {
    return this.entries.get(id) || null;
  }

  /**
   * Delete a vector entry
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.entries.delete(id);
    if (deleted) {
      this.scheduleSave();
    }
    return deleted;
  }

  /**
   * Search for similar vectors using cosine similarity
   */
  /**
   * P2.2: Search with HCF encrypted vectors support
   * Accepts both plain and encrypted query vectors
   */
  async search(
    queryEmbedding: number[],
    options: {
      topK?: number;
      minSimilarity?: number;
      filter?: (entry: VectorEntry) => boolean;
      useEncrypted?: boolean; // P2.2: Enable HCF encrypted search
    } = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 5,
      minSimilarity = 0.5,
      filter,
      useEncrypted = false,
    } = options;

    // P2.2: If encrypted search requested, use HCF operations
    if (useEncrypted) {
      console.log('🔐 [HCF] Performing encrypted similarity search');
      const { encryptVector, encryptedDistance } =
        await import('./crypto/homomorphicProduction');

      // Encrypt query vector
      const encryptedQuery = encryptVector(queryEmbedding);

      const results: SearchResult[] = [];

      for (const entry of this.entries.values()) {
        // Apply filter if provided
        if (filter && !filter(entry)) {
          continue;
        }

        // Use encrypted embedding if available, otherwise encrypt on-the-fly
        let distance: number;
        if (entry.encryptedEmbedding) {
          distance = encryptedDistance(
            encryptedQuery,
            entry.encryptedEmbedding
          );
        } else {
          const encryptedEntry = encryptVector(entry.embedding);
          distance = encryptedDistance(encryptedQuery, encryptedEntry);
        }

        // Convert distance to similarity (inverse relationship)
        const similarity = 1 - distance;

        if (similarity >= minSimilarity) {
          results.push({ entry, similarity });
        }
      }

      // Sort by similarity descending and take top K
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, topK);
    }

    // Original plain-text search
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      // Apply filter if provided
      if (filter && !filter(entry)) {
        continue;
      }

      // P2.6: Use summary vector for initial filtering if available
      let similarity: number;
      if (
        entry.summaryVector &&
        queryEmbedding.length > entry.summaryVector.length
      ) {
        // Fast filtering with summary vector
        const querySummary = queryEmbedding.slice(
          0,
          entry.summaryVector.length
        );
        const prelimSimilarity = cosineSimilarity(
          querySummary,
          entry.summaryVector
        );

        // Only compute full similarity if summary passes threshold
        if (prelimSimilarity >= minSimilarity * 0.8) {
          if (queryEmbedding.length !== entry.embedding.length) {
            console.warn(
              `Skipping vector ${entry.id} due to embedding dimension mismatch (${queryEmbedding.length} vs ${entry.embedding.length})`
            );
            continue;
          }
          similarity = cosineSimilarity(queryEmbedding, entry.embedding);
        } else {
          continue; // Skip this entry
        }
      } else {
        if (queryEmbedding.length !== entry.embedding.length) {
          console.warn(
            `Skipping vector ${entry.id} due to embedding dimension mismatch (${queryEmbedding.length} vs ${entry.embedding.length})`
          );
          continue;
        }
        similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      }

      if (similarity >= minSimilarity) {
        results.push({ entry, similarity });
      }
    }

    // Sort by similarity descending and take top K
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * Get all entries matching a filter
   */
  async filter(
    predicate: (entry: VectorEntry) => boolean
  ): Promise<VectorEntry[]> {
    const results: VectorEntry[] = [];
    for (const entry of this.entries.values()) {
      if (predicate(entry)) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Get total number of entries
   */
  async count(): Promise<number> {
    return this.entries.size;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.entries.clear();
    this.scheduleSave();
  }

  /**
   * Force immediate save to disk
   */
  async flush(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.saveToDisk();
  }
}

// ===========================================================================================
// EMBEDDING GENERATION
// ===========================================================================================

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL ||
  process.env.LOCAL_EMBEDDING_MODEL ||
  'nomic-embed-text';

/**
 * Generate embeddings through a local Ollama embedding model.
 */
async function generateOllamaEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  const cleanTexts = texts.map((text) =>
    text.replace(/\s+/g, ' ').trim().slice(0, 32000)
  );

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_EMBEDDING_MODEL,
        input: cleanTexts.length === 1 ? cleanTexts[0] : cleanTexts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `Ollama embedding request failed (${response.status}): ${errorText}`
      );
      return cleanTexts.map(() => null);
    }

    const data = (await response.json()) as {
      embeddings?: number[][];
      embedding?: number[];
    };

    if (Array.isArray(data.embeddings)) {
      return data.embeddings.map((embedding) =>
        Array.isArray(embedding) ? embedding : null
      );
    }

    if (Array.isArray(data.embedding)) {
      return [data.embedding];
    }

    console.warn('Ollama embedding response did not include embeddings');
    return cleanTexts.map(() => null);
  } catch (error) {
    console.warn(
      `Ollama embedding model unavailable at ${OLLAMA_HOST} (${OLLAMA_EMBEDDING_MODEL})`
    );
    console.error('Error generating Ollama embeddings:', error);
    return cleanTexts.map(() => null);
  }
}

/**
 * Generate embedding for text content
 */
export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  const [embedding] = await generateOllamaEmbeddings([text]);
  return embedding || null;
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  return generateOllamaEmbeddings(texts);
}

// ===========================================================================================
// SIMILARITY CALCULATION
// ===========================================================================================

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

// ===========================================================================================
// VECTOR DATABASE SERVICE
// ===========================================================================================

class VectorDBService {
  private store: VectorStore;

  constructor() {
    this.store = new VectorStore();
  }

  /**
   * Generate embedding (wrapper for testability)
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    return generateEmbedding(text);
  }

  /**
   * Generate embeddings batch (wrapper for testability)
   */
  async generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    return generateEmbeddings(texts);
  }

  /**
   * Add content to vector database with automatic embedding generation
   */
  async addContent(
    id: string,
    content: string,
    metadata: VectorEntry['metadata']
  ): Promise<boolean> {
    const embedding = await this.generateEmbedding(content);

    if (!embedding) {
      console.warn(`Failed to generate embedding for content: ${id}`);
      return false;
    }

    const entry: VectorEntry = {
      id,
      content,
      embedding,
      metadata,
    };

    await this.store.upsert(entry);
    return true;
  }

  /**
   * Add multiple content items (batched)
   */
  async addContentBatch(
    items: Array<{
      id: string;
      content: string;
      metadata: VectorEntry['metadata'];
    }>
  ): Promise<number> {
    const texts = items.map((item) => item.content);
    const embeddings = await this.generateEmbeddings(texts);

    const entries: VectorEntry[] = [];
    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (embeddings[i]) {
        entries.push({
          id: items[i].id,
          content: items[i].content,
          embedding: embeddings[i]!,
          metadata: items[i].metadata,
        });
        successCount++;
      }
    }

    if (entries.length > 0) {
      await this.store.upsertBatch(entries);
    }

    return successCount;
  }

  /**
   * Semantic search for similar content
   */
  async semanticSearch(
    query: string,
    options: {
      topK?: number;
      minSimilarity?: number;
      type?: VectorEntry['metadata']['type'];
      userId?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const embedding = await this.generateEmbedding(query);

    if (!embedding) {
      console.warn('Failed to generate embedding for query');
      return [];
    }

    const { type, userId, ...searchOptions } = options;

    const results = await this.store.search(embedding, {
      ...searchOptions,
      filter:
        type || userId
          ? (entry) => {
              if (type && entry.metadata.type !== type) return false;
              if (userId && entry.metadata.userId !== userId) return false;
              return true;
            }
          : undefined,
    });

    return results;
  }

  /**
   * Get content by ID
   */
  async getContent(id: string): Promise<VectorEntry | null> {
    return this.store.get(id);
  }

  /**
   * Delete content by ID
   */
  async deleteContent(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * Get statistics about the vector database
   */
  async getStats(): Promise<{
    totalEntries: number;
    byType: Record<string, number>;
  }> {
    const total = await this.store.count();
    const allEntries = await this.store.filter(() => true);

    const byType: Record<string, number> = {};
    allEntries.forEach((entry) => {
      const type = entry.metadata.type;
      byType[type] = (byType[type] || 0) + 1;
    });

    return {
      totalEntries: total,
      byType,
    };
  }

  /**
   * Clear all entries (use with caution)
   */
  async clear(): Promise<void> {
    await this.store.clear();
  }

  /**
   * Force save to disk
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }

  /**
   * Return total number of indexed entries
   */
  async getStoreSize(): Promise<number> {
    return this.store.count();
  }
}

// Export singleton instance
export const vectorDB = new VectorDBService();
