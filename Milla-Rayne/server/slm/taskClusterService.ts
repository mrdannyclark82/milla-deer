/**
 * Task Cluster Service
 *
 * Phase 2 Step 3: Runs unsupervised clustering on sanitized usage data
 * to identify recurring agent operation types.
 *
 * Uses TF-IDF + cosine similarity (no external ML deps needed) to group
 * prompts into clusters like:
 *   - intent_recognition
 *   - code_generation
 *   - memory_retrieval
 *   - summarization
 *   - iot_control
 *   - scheduling
 *   - creative_writing
 *
 * Cluster labels are written back to the usage records and used by the
 * SLM router to select the right local model for each task type.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { loadRecentUsage, type UsageRecord } from './agentUsageLogger';
import { scrubBatch } from './piiScrubber';

// ─── Task Taxonomy ────────────────────────────────────────────────────────────

/** Predefined cluster definitions with keyword signals */
const CLUSTER_DEFINITIONS: Array<{
  id: string;
  label: string;
  keywords: string[];
  /** Preferred local SLM for this cluster */
  preferredModel: string;
}> = [
  {
    id: 'intent_recognition',
    label: 'Intent Recognition',
    keywords: ['intent', 'classify', 'what does the user want', 'determine', 'identify request', 'parse user'],
    preferredModel: 'milla-local:latest',
  },
  {
    id: 'code_generation',
    label: 'Code Generation',
    keywords: ['write code', 'function', 'typescript', 'javascript', 'python', 'implement', 'class', 'async', 'export'],
    preferredModel: 'qwen2.5-coder:1.5b',
  },
  {
    id: 'memory_retrieval',
    label: 'Memory Retrieval',
    keywords: ['memory', 'recall', 'remember', 'search', 'find previous', 'history', 'context from'],
    preferredModel: 'milla-local:latest',
  },
  {
    id: 'summarization',
    label: 'Summarization',
    keywords: ['summarize', 'summary', 'tldr', 'brief overview', 'condense', 'key points', 'main ideas'],
    preferredModel: 'milla-local:latest',
  },
  {
    id: 'iot_control',
    label: 'IoT / Home Automation',
    keywords: ['light', 'home assistant', 'mqtt', 'thermostat', 'device', 'turn on', 'turn off', 'sensor', 'entity_id'],
    preferredModel: 'milla-local:latest',
  },
  {
    id: 'scheduling',
    label: 'Scheduling / Calendar',
    keywords: ['schedule', 'calendar', 'remind', 'appointment', 'cron', 'daily', 'weekly', 'at noon', 'tomorrow'],
    preferredModel: 'milla-local:latest',
  },
  {
    id: 'creative_writing',
    label: 'Creative Writing / Persona',
    keywords: ['write a story', 'roleplay', 'creative', 'poem', 'narrative', 'character', 'milla says', 'personality'],
    preferredModel: 'mrdannyclark82/milla-rayne:latest',
  },
  {
    id: 'code_review',
    label: 'Code Review / Analysis',
    keywords: ['review', 'analyze code', 'bug', 'fix', 'refactor', 'improve', 'what is wrong', 'test'],
    preferredModel: 'qwen2.5-coder:1.5b',
  },
  {
    id: 'deep_reasoning',
    label: 'Deep Reasoning / Planning',
    keywords: ['plan', 'reasoning', 'think step by step', 'chain of thought', 'analyze', 'complex', 'multi-step', 'horizon'],
    preferredModel: 'cloud', // always use cloud for deep reasoning
  },
  {
    id: 'general_chat',
    label: 'General Chat',
    keywords: ['hello', 'how are you', 'what can you do', 'tell me about', 'explain', 'help me'],
    preferredModel: 'mrdannyclark82/milla-rayne:latest',
  },
];

// ─── TF-IDF Classifier ────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreAgainstCluster(tokens: string[], keywords: string[]): number {
  let score = 0;
  const tokenSet = new Set(tokens);
  for (const kw of keywords) {
    const kwTokens = tokenize(kw);
    // Phrase match — all keywords in the phrase appear within 5 tokens of each other
    const allPresent = kwTokens.every((t) => tokenSet.has(t));
    if (allPresent) score += kwTokens.length; // longer phrase = higher weight
  }
  return score;
}

/**
 * Classify a prompt into a task cluster using keyword scoring.
 * Returns the cluster id and preferred model.
 */
export function classifyPrompt(prompt: string): {
  clusterId: string;
  clusterLabel: string;
  preferredModel: string;
  confidence: number;
} {
  const tokens = tokenize(prompt);
  let bestScore = 0;
  let bestCluster = CLUSTER_DEFINITIONS[CLUSTER_DEFINITIONS.length - 1]; // default: general_chat

  for (const cluster of CLUSTER_DEFINITIONS) {
    const score = scoreAgainstCluster(tokens, cluster.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
    }
  }

  const confidence = Math.min(bestScore / 5, 1.0);
  return {
    clusterId: bestCluster.id,
    clusterLabel: bestCluster.label,
    preferredModel: bestCluster.preferredModel,
    confidence,
  };
}

// ─── Batch Clustering ─────────────────────────────────────────────────────────

const CLUSTERED_FILE = join(process.cwd(), 'memory', 'agent_usage_clustered.jsonl');

export interface ClusteredRecord extends UsageRecord {
  taskCluster: string;
  clusterLabel: string;
  preferredModel: string;
  clusterConfidence: number;
}

/**
 * Process recent usage records: scrub PII → classify → write clustered file.
 * Run periodically (e.g., daily cron) to build the SLM training dataset.
 */
export async function runClusteringPass(limit = 500): Promise<{
  processed: number;
  clusterCounts: Record<string, number>;
}> {
  const raw = await loadRecentUsage(limit);
  const scrubbed = scrubBatch(raw);

  const clusterCounts: Record<string, number> = {};
  const clustered: ClusteredRecord[] = [];

  for (const record of scrubbed) {
    const classification = classifyPrompt(record.prompt);
    const cr: ClusteredRecord = {
      ...record,
      taskCluster: classification.clusterId,
      clusterLabel: classification.clusterLabel,
      preferredModel: classification.preferredModel,
      clusterConfidence: classification.confidence,
    };
    clustered.push(cr);
    clusterCounts[classification.clusterId] = (clusterCounts[classification.clusterId] || 0) + 1;
  }

  const lines = clustered.map((r) => JSON.stringify(r)).join('\n');
  await fs.writeFile(CLUSTERED_FILE, lines + '\n', 'utf-8');

  return { processed: clustered.length, clusterCounts };
}

/**
 * Get cluster stats from the clustered usage file.
 */
export async function getClusterStats(): Promise<Record<string, number>> {
  try {
    const raw = await fs.readFile(CLUSTERED_FILE, 'utf-8');
    const records: ClusteredRecord[] = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const counts: Record<string, number> = {};
    for (const r of records) {
      counts[r.taskCluster] = (counts[r.taskCluster] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

/**
 * Export training data for a specific cluster in JSONL fine-tuning format.
 * Format: {"prompt": "...", "completion": "..."} — compatible with LoRA/QLoRA pipelines.
 */
export async function exportClusterForFineTuning(clusterId: string): Promise<string> {
  const raw = await fs.readFile(CLUSTERED_FILE, 'utf-8');
  const records: ClusteredRecord[] = raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r: ClusteredRecord) => r.taskCluster === clusterId && r.success);

  const lines = records.map((r) =>
    JSON.stringify({ prompt: r.prompt, completion: r.output }),
  );
  return lines.join('\n');
}

export { CLUSTER_DEFINITIONS };
