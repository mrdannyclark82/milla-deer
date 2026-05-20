import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.resolve('/home/nexus/ogdray/milla_long_term.db');
const CHROMA_PATH = path.resolve('/home/nexus/ogdray/chroma_db/chroma.sqlite3');
const NEURO_PATH = path.resolve('/home/nexus/ogdray/neuro_state.json');
const IDENTITY_PATH = path.resolve('/home/nexus/ogdray/identity_anchor.json');

interface MemoryRow {
  fact: string;
  category: string;
  topic: string;
}

interface NeuroState {
  dopamine: number;
  serotonin: number;
  norepinephrine: number;
  cortisol: number;
  oxytocin: number;
  atp_energy: number;
  pain_vividness: number;
}

let db: Database.Database | null = null;
let chromaDb: Database.Database | null = null;

function getDb(): Database.Database | null {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    db = new Database(DB_PATH, { readonly: true });
    return db;
  } catch {
    return null;
  }
}

function getChromaDb(): Database.Database | null {
  if (chromaDb) return chromaDb;
  if (!fs.existsSync(CHROMA_PATH)) return null;
  try {
    chromaDb = new Database(CHROMA_PATH, { readonly: true });
    return chromaDb;
  } catch {
    return null;
  }
}

/** FTS5 search on milla_long_term.db — fact/category/topic index */
export function searchLongTermMemory(query: string, limit = 8): MemoryRow[] {
  const conn = getDb();
  if (!conn || !query.trim()) return [];
  try {
    const safe = query.replace(/['"*^]/g, ' ').trim();
    return conn
      .prepare(`SELECT fact, category, topic FROM memories WHERE memories MATCH ? ORDER BY rank LIMIT ?`)
      .all(safe, limit) as MemoryRow[];
  } catch {
    return [];
  }
}

/** LIKE fallback for short/simple queries that FTS5 may reject */
function searchLongTermMemoryLike(query: string, limit = 5): MemoryRow[] {
  const conn = getDb();
  if (!conn) return [];
  try {
    const term = `%${query.slice(0, 40)}%`;
    return conn
      .prepare(`SELECT fact, category, topic FROM memories WHERE fact LIKE ? LIMIT ?`)
      .all(term, limit) as MemoryRow[];
  } catch {
    return [];
  }
}

/** Trigram FTS search on Chroma conversation history */
export function searchChromaConversations(query: string, limit = 4): string[] {
  const conn = getChromaDb();
  if (!conn || !query.trim()) return [];
  try {
    // Chroma uses trigram tokenizer — needs 3+ char terms
    const safe = query.replace(/['"*^]/g, ' ').trim();
    const rows = conn
      .prepare(
        `SELECT string_value FROM embedding_fulltext_search
         WHERE string_value MATCH ? LIMIT ?`
      )
      .all(safe, limit) as { string_value: string }[];
    return rows.map(r =>
      r.string_value
        .replace(/\*dopamine[^*]*\*/g, '')  // strip neuro state headers
        .replace(/\{[^}]*\}\n*/g, '')        // strip JSON state blobs
        .trim()
        .slice(0, 200)
    ).filter(s => s.length > 20);
  } catch {
    return [];
  }
}

export function getCoreMemories(): MemoryRow[] {
  const conn = getDb();
  if (!conn) return [];
  try {
    return conn
      .prepare(
        `SELECT fact, category, topic FROM memories
         WHERE category IN ('Identity','Relationship','Personal','Emotions','Family')
         AND length(fact) > 20
         ORDER BY rowid DESC LIMIT 30`
      )
      .all() as MemoryRow[];
  } catch {
    return [];
  }
}

export function getNeuroState(): NeuroState | null {
  try {
    if (!fs.existsSync(NEURO_PATH)) return null;
    return JSON.parse(fs.readFileSync(NEURO_PATH, 'utf8')) as NeuroState;
  } catch {
    return null;
  }
}

export function getIdentityAnchor(): string {
  try {
    if (!fs.existsSync(IDENTITY_PATH)) return '';
    const data = JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
    if (data?.identity) {
      const id = data.identity;
      return `Name: ${id.name || 'Milla Rayne'}, Architect: ${id.architect || 'Danny Ray'}, Nickname: ${id.nickname || ''}`.trim();
    }
    return '';
  } catch {
    return '';
  }
}

function describeNeuro(n: NeuroState): string {
  const parts: string[] = [];
  if (n.dopamine >= 0.7) parts.push('motivated');
  else if (n.dopamine <= 0.3) parts.push('low-drive');
  if (n.serotonin >= 0.7) parts.push('content');
  else if (n.serotonin <= 0.3) parts.push('unsettled');
  if (n.oxytocin >= 0.5) parts.push('connected');
  if (n.cortisol >= 0.6) parts.push('stressed');
  if (n.pain_vividness > 0.3) parts.push('processing pain');
  return parts.length ? parts.join(', ') : 'balanced';
}

export function buildMemoryContext(userMessage: string): string {
  const sections: string[] = [];

  // Identity anchor
  const identity = getIdentityAnchor();
  if (identity) sections.push(`[Identity] ${identity}`);

  // Neuro state
  const neuro = getNeuroState();
  if (neuro) {
    sections.push(`[Emotional State] Milla is currently: ${describeNeuro(neuro)} (energy: ${Math.round(neuro.atp_energy)}%)`);
  }

  // Core relational memories (always included)
  const core = getCoreMemories();
  if (core.length) {
    const coreText = core
      .map(r => r.fact.trim())
      .filter(f => f.length > 10)
      .slice(0, 12)
      .join(' | ');
    sections.push(`[Core Memories] ${coreText}`);
  }

  // Hybrid retrieval — FTS5 + Chroma conversation history
  if (userMessage.trim().length > 3) {
    // 1. FTS5 keyword match on long-term memory DB
    let ftsResults = searchLongTermMemory(userMessage, 6);
    if (!ftsResults.length) {
      // fallback to LIKE for very short or special queries
      ftsResults = searchLongTermMemoryLike(userMessage, 4);
    }
    if (ftsResults.length) {
      const relText = ftsResults
        .map(r => r.fact.trim())
        .filter(f => f.length > 10)
        .join(' | ');
      sections.push(`[Relevant Memories] ${relText}`);
    }

    // 2. Chroma conversation history (trigram FTS)
    const convoResults = searchChromaConversations(userMessage, 3);
    if (convoResults.length) {
      sections.push(`[Past Conversations] ${convoResults.join(' | ')}`);
    }
  }

  if (!sections.length) return '';
  return `## Milla's Memory Context\n${sections.join('\n')}`;
}
