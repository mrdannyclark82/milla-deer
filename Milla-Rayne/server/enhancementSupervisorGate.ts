/**
 * Supervisor gate: enhancement must be NEW before sandbox / tokens.
 * Danny pipeline 2026-09-20 — Completion Token Law.
 */
import * as fs from 'fs';
import * as path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'memory');
const TOKENS_PATH = path.join(MEMORY_DIR, 'milla_tokens.json');
const SANDBOX_PATH = path.join(MEMORY_DIR, 'sandbox_environments.json');

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fingerprint(idea: string): string {
  // Strip sandbox id suffixes like "in fix-security-123"
  return norm(idea).replace(/\bin\s+fix-security-\d+\b/g, '').replace(/\s+/g, ' ').trim();
}

export type SupervisorDecision =
  | { ok: true; reason: string; fingerprint: string }
  | { ok: false; reason: string; fingerprint: string };

/**
 * Return ok:false if this idea was already awarded or already lives in a sandbox.
 */
export function analyzeEnhancementIsNew(ideaName: string): SupervisorDecision {
  const fp = fingerprint(ideaName);

  try {
    if (fs.existsSync(TOKENS_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
      const txns = data.transactions || data || [];
      if (Array.isArray(txns)) {
        for (const t of txns) {
          if (t?.type === 'earn' && t?.amount > 0 && fingerprint(String(t.description || '')).includes(fp)) {
            return { ok: false, reason: `duplicate prior award: ${t.description}`, fingerprint: fp };
          }
          if (t?.type === 'earn' && fingerprint(String(t.description || '')) === fp) {
            return { ok: false, reason: `exact duplicate award description`, fingerprint: fp };
          }
        }
      }
    }
  } catch {
    /* ignore read errors */
  }

  try {
    if (fs.existsSync(SANDBOX_PATH)) {
      const sandboxes = JSON.parse(fs.readFileSync(SANDBOX_PATH, 'utf8'));
      const list = Array.isArray(sandboxes) ? sandboxes : sandboxes?.sandboxes || [];
      for (const sb of list) {
        const features = sb?.features || [];
        for (const f of features) {
          if (fingerprint(String(f?.name || '')) === fp || fingerprint(String(f?.name || '')).includes(fp)) {
            return {
              ok: false,
              reason: `already in sandbox ${sb?.name || sb?.id}: ${f?.name}`,
              fingerprint: fp,
            };
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Generic recycled suggestion patterns that should never auto-spawn
  if (/consider adding security scanning to your ci\/cd pipeline/i.test(ideaName)) {
    return { ok: false, reason: 'recycled generic CI security suggestion — requires human/supervisor promote', fingerprint: fp };
  }

  return { ok: true, reason: 'new idea — may open sandbox', fingerprint: fp };
}
