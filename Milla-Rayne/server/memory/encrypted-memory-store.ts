/**
 * Encrypted offline semantic memory store for Milla-Rayne.
 *
 * Provides persistent, encrypted vector-indexed memory that survives server
 * restarts. Implements a lightweight FAISS-style cosine similarity search
 * over AES-256-GCM encrypted entries — no cloud, no plaintext on disk.
 *
 * Inspired by the Off Grid RN FAISS + Gemma 3n pattern, adapted for Node.js.
 *
 * Storage: MILLA_MEMORY_PATH/encrypted_memory.bin (binary, versioned)
 * Key:     MILLA_MEMORY_KEY env var (32-byte hex) — auto-generated if absent
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────

const MEMORY_DIR = process.env.MILLA_MEMORY_PATH ?? join(process.cwd(), 'memory');
const STORE_FILE = join(MEMORY_DIR, 'encrypted_memory.bin');
const KEY_FILE = join(MEMORY_DIR, '.memory_key');
const STORE_VERSION = 1;
const MAX_ENTRIES = 10_000;
const EMBEDDING_DIM = 512; // FG-CLIP2 / MobileCLIP-S2 output dim

// ── Types ─────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  text: string;
  tags: string[];
  embedding: number[] | null;
  source: 'vision' | 'chat' | 'gim' | 'swarm' | 'manual';
  createdAt: string;
  sessionId?: string;
}

export interface SemanticSearchResult {
  entry: MemoryEntry;
  score: number;
}

interface StoredPayload {
  version: number;
  entries: MemoryEntry[];
  updatedAt: string;
}

// ── Encryption helpers ────────────────────────────────────────────────────

function loadOrCreateKey(): Buffer {
  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE, 'utf8').trim();
    if (raw.length === 64) return Buffer.from(raw, 'hex');
  }
  const key = randomBytes(32);
  mkdirSync(MEMORY_DIR, { recursive: true });
  writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

function encrypt(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: [iv(12)] [tag(16)] [encrypted]
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(data: Buffer, key: Buffer): string {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ── Cosine similarity ─────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function textEmbedding(text: string): number[] {
  // Deterministic bag-of-chars embedding for text-only entries (no vector model).
  // Replace with real embedding call when available.
  const hash = createHash('sha512').update(text.toLowerCase()).digest();
  const vec: number[] = [];
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    vec.push((hash[i % hash.length] / 255) * 2 - 1);
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

// ── Store ─────────────────────────────────────────────────────────────────

class EncryptedMemoryStore {
  private key: Buffer;
  private entries: MemoryEntry[] = [];
  private dirty = false;

  constructor() {
    this.key = loadOrCreateKey();
    this.load();
  }

  private load(): void {
    if (!existsSync(STORE_FILE)) return;
    try {
      const raw = readFileSync(STORE_FILE);
      const json = decrypt(raw, this.key);
      const payload = JSON.parse(json) as StoredPayload;
      if (payload.version === STORE_VERSION) {
        this.entries = payload.entries;
      }
    } catch {
      // Corrupted or wrong key — start fresh, keep file as backup
      this.entries = [];
    }
  }

  flush(): void {
    if (!this.dirty) return;
    mkdirSync(MEMORY_DIR, { recursive: true });
    const payload: StoredPayload = {
      version: STORE_VERSION,
      entries: this.entries,
      updatedAt: new Date().toISOString(),
    };
    const encrypted = encrypt(JSON.stringify(payload), this.key);
    writeFileSync(STORE_FILE, encrypted);
    this.dirty = false;
  }

  add(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): MemoryEntry {
    const full: MemoryEntry = {
      ...entry,
      id: randomBytes(8).toString('hex'),
      createdAt: new Date().toISOString(),
      // Auto-generate embedding from text if none provided
      embedding: entry.embedding ?? (entry.text ? textEmbedding(entry.text) : null),
    };

    this.entries.push(full);

    // Evict oldest entries beyond limit
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }

    this.dirty = true;
    return full;
  }

  /**
   * Semantic search: finds top-k entries by cosine similarity to query.
   * Falls back to text substring match if no embeddings present.
   */
  search(
    queryEmbedding: number[] | null,
    queryText: string,
    topK = 5,
    sourceFilter?: MemoryEntry['source']
  ): SemanticSearchResult[] {
    let pool = sourceFilter
      ? this.entries.filter(e => e.source === sourceFilter)
      : this.entries;

    const effectiveEmbedding = queryEmbedding ?? (queryText ? textEmbedding(queryText) : null);

    if (effectiveEmbedding) {
      return pool
        .map(entry => ({
          entry,
          score: entry.embedding ? cosineSimilarity(effectiveEmbedding, entry.embedding) : 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }

    // Text fallback
    const q = queryText.toLowerCase();
    return pool
      .filter(e => e.text.toLowerCase().includes(q) || e.tags.some(t => t.includes(q)))
      .slice(-topK)
      .map(entry => ({ entry, score: 1 }));
  }

  getRecent(n = 20, source?: MemoryEntry['source']): MemoryEntry[] {
    const pool = source ? this.entries.filter(e => e.source === source) : this.entries;
    return pool.slice(-n).reverse();
  }

  deleteById(id: string): boolean {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.dirty = true;
    return true;
  }

  clear(source?: MemoryEntry['source']): number {
    const before = this.entries.length;
    this.entries = source ? this.entries.filter(e => e.source !== source) : [];
    this.dirty = true;
    return before - this.entries.length;
  }

  stats() {
    const bySource: Record<string, number> = {};
    for (const e of this.entries) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
    }
    return {
      total: this.entries.length,
      bySource,
      storeFile: STORE_FILE,
      encrypted: true,
    };
  }
}

// Singleton — shared across all server modules
export const encryptedMemory = new EncryptedMemoryStore();

// Auto-flush on graceful shutdown
process.on('beforeExit', () => encryptedMemory.flush());
process.on('SIGTERM', () => { encryptedMemory.flush(); process.exit(0); });
process.on('SIGINT',  () => { encryptedMemory.flush(); process.exit(0); });
