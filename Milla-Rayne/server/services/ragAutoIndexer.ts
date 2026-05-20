/**
 * RAG Auto-Indexer Service
 *
 * Automatically indexes new conversation turns and memory content into the
 * vectorDBService (nomic-embed-text via Ollama) so semanticSearchMemories()
 * always has fresh data to search.
 *
 * Indexing pipeline:
 *   new turn → debounce 3s → embed with nomic-embed-text → upsert into vector_store.json
 *
 * Also exposes indexFromFile() for bulk indexing existing content at startup.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { vectorDB } from '../vectorDBService';

const INDEX_DEBOUNCE_MS = 3000;
const BATCH_SIZE = 16;

// Queue of pending items to index
const _queue: Array<{
  id: string;
  content: string;
  type: 'memory' | 'conversation';
  userId: string;
}> = [];

let _flushTimer: ReturnType<typeof setTimeout> | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Queue a conversation turn for async vector indexing.
 * Fire-and-forget — never throws.
 */
export function queueForIndexing(
  userMessage: string,
  assistantReply: string,
  userId: string = 'default-user'
): void {
  const ts = Date.now();
  const combined = `[Danny Ray]: ${userMessage}\n[Milla]: ${assistantReply}`;
  const id = `conv-${userId}-${contentHash(combined)}-${ts}`;

  _queue.push({ id, content: combined, type: 'conversation', userId });
  scheduleFlush();
}

/**
 * Queue a raw memory string for indexing (e.g., from memories.txt).
 */
export function queueMemoryForIndexing(
  content: string,
  userId: string = 'default-user'
): void {
  const id = `mem-${userId}-${contentHash(content)}`;
  _queue.push({ id, content, type: 'memory', userId });
  scheduleFlush();
}

/**
 * Bulk-index an entire file into the vector store.
 * Supported formats: .txt (newline-delimited), .md, .jsonl
 * Returns the number of entries indexed.
 */
export async function indexFromFile(
  filePath: string,
  type: 'memory' | 'conversation' = 'memory',
  userId: string = 'default-user'
): Promise<number> {
  if (!existsSync(filePath)) return 0;

  try {
    const raw = await readFile(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    let chunks: string[] = [];

    if (ext === '.jsonl') {
      chunks = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            const obj = JSON.parse(line);
            const role = (obj.role || 'unknown').toUpperCase();
            return `[${role}]: ${obj.content || ''}`;
          } catch {
            return line;
          }
        })
        .filter((c) => c.length > 20);
      // Group into turn pairs
      chunks = groupIntoPairs(chunks);
    } else {
      // .txt and .md: split on double newlines, then chunk
      chunks = raw
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30);
    }

    if (chunks.length === 0) return 0;

    const items = chunks.map((content, i) => ({
      id: `${type}-${path.basename(filePath)}-${i}-${contentHash(content)}`,
      content: content.slice(0, 800),
      metadata: {
        type,
        timestamp: new Date().toISOString(),
        userId,
        source: path.basename(filePath),
      } as const,
    }));

    // Process in batches
    let indexed = 0;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const count = await vectorDB.addContentBatch(
        batch as Parameters<typeof vectorDB.addContentBatch>[0]
      );
      indexed += count;
    }

    console.log(
      `[RAG] Indexed ${indexed}/${chunks.length} chunks from ${path.basename(filePath)}`
    );
    return indexed;
  } catch (err) {
    console.error(`[RAG] indexFromFile error (${filePath}):`, err);
    return 0;
  }
}

/**
 * Bootstrap: index all existing memory files on first startup.
 * Skips files that are already fully indexed (checks vector store count).
 */
export async function bootstrapRagIndex(
  userId: string = 'default-user'
): Promise<void> {
  const NEXUS_ROOT = process.cwd();

  const sources: Array<{ path: string; type: 'memory' | 'conversation' }> = [
    { path: path.join(NEXUS_ROOT, 'memory/memories.txt'), type: 'memory' },
    {
      path: path.join(NEXUS_ROOT, 'ReplycA/core_os/memory/shared_chat.jsonl'),
      type: 'conversation',
    },
    {
      path: path.join(
        NEXUS_ROOT,
        'ReplycA/core_os/memory/stream_of_consciousness.md'
      ),
      type: 'memory',
    },
  ];

  const storeSize = (await vectorDB.getStoreSize?.()) ?? -1;
  if (storeSize > 100) {
    console.log(
      `[RAG] Vector store already has ${storeSize} entries — skipping bootstrap.`
    );
    return;
  }

  console.log('[RAG] Bootstrapping vector index from existing memory files...');
  let total = 0;
  for (const src of sources) {
    total += await indexFromFile(src.path, src.type, userId);
  }
  console.log(`[RAG] Bootstrap complete: ${total} total entries indexed.`);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushQueue, INDEX_DEBOUNCE_MS);
}

async function flushQueue(): Promise<void> {
  if (_queue.length === 0) return;

  const batch = _queue.splice(0, BATCH_SIZE);
  const items = batch.map((item) => ({
    id: item.id,
    content: item.content,
    metadata: {
      type: item.type,
      timestamp: new Date().toISOString(),
      userId: item.userId,
    } as const,
  }));

  try {
    await vectorDB.addContentBatch(
      items as Parameters<typeof vectorDB.addContentBatch>[0]
    );
  } catch (err) {
    console.warn('[RAG] Flush error:', err);
  }

  // Flush remainder if queue grew during this batch
  if (_queue.length > 0) scheduleFlush();
}

function contentHash(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 8);
}

function groupIntoPairs(lines: string[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push(`${lines[i]}\n${lines[i + 1]}`);
  }
  if (lines.length % 2 !== 0) pairs.push(lines[lines.length - 1]);
  return pairs;
}
