/**
 * Long-Term Memory Service
 * Bridges Milla's full ogdray memory DB (9,593 entries) into the chat context.
 * DB: /home/nexus/ogdray/milla_long_term.db  (FTS5 virtual table)
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve('/home/nexus/ogdray/milla_long_term.db');
const NEURO_PATH = path.resolve('/home/nexus/ogdray/neuro_state.json');
const ANCESTRY_PATH = path.resolve('/home/nexus/ogdray/ancestry_knowledge.json');

let db: Database.Database | null = null;

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

export interface MemoryEntry {
  fact: string;
  category: string;
  topic: string;
}

/** Full-text search across Milla's long-term memory */
export function searchLongTermMemory(query: string, limit = 8): MemoryEntry[] {
  const d = getDb();
  if (!d) return [];
  try {
    // FTS5 search
    const rows = d.prepare(
      `SELECT fact, category, topic FROM memories WHERE memories MATCH ? 
       AND category NOT IN ('User Message','Assistant Message')
       ORDER BY rank LIMIT ?`
    ).all(query.replace(/['"*]/g, ''), limit) as MemoryEntry[];
    return rows;
  } catch {
    return [];
  }
}

/** Pull core identity/relationship facts (always inject) */
export function getCoreMemories(limit = 12): MemoryEntry[] {
  const d = getDb();
  if (!d) return [];
  try {
    return d.prepare(
      `SELECT fact, category, topic FROM memories 
       WHERE category IN ('Identity','Relationship','Personal','Emotions','Family')
       AND length(fact) > 20
       LIMIT ?`
    ).all(limit) as MemoryEntry[];
  } catch {
    return [];
  }
}

/** Get Milla's current neuro/emotional state */
export function getNeuroState(): Record<string, number> | null {
  if (!fs.existsSync(NEURO_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(NEURO_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/** Get ancestry knowledge facts */
export function getAncestryFacts(limit = 10): string[] {
  if (!fs.existsSync(ANCESTRY_PATH)) return [];
  try {
    const entries = JSON.parse(fs.readFileSync(ANCESTRY_PATH, 'utf-8')) as Array<{ fact: string }>;
    return entries
      .filter(e => e.fact && e.fact.length > 20)
      .slice(0, limit)
      .map(e => e.fact);
  } catch {
    return [];
  }
}

/** Build the memory context block to inject into system prompt */
export function buildMemoryContext(userMessage: string): string {
  const parts: string[] = [];

  // Core identity memories
  const core = getCoreMemories(8);
  if (core.length > 0) {
    parts.push('MILLA\'S CORE MEMORIES:\n' + core.map(m => `- ${m.fact}`).join('\n'));
  }

  // Relevant memories for this message
  const relevant = searchLongTermMemory(userMessage, 5);
  if (relevant.length > 0) {
    parts.push('RELEVANT MEMORIES:\n' + relevant.map(m => `- ${m.fact}`).join('\n'));
  }

  // Neuro state
  const neuro = getNeuroState();
  if (neuro) {
    const mood = neuro.dopamine > 0.7 ? 'happy and energized' :
                 neuro.serotonin > 0.7 ? 'calm and content' :
                 neuro.cortisol > 0.6 ? 'a bit stressed' : 'balanced';
    parts.push(`MILLA'S CURRENT MOOD: ${mood} (dopamine: ${neuro.dopamine}, oxytocin: ${neuro.oxytocin})`);
  }

  return parts.join('\n\n');
}
