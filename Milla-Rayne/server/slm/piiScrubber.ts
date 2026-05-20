/**
 * PII Scrubber
 *
 * Phase 2 Step 2: Strips PII, API keys, and sensitive data from usage records
 * before they enter the task clustering / SLM training pipeline.
 *
 * Targets: email addresses, phone numbers, API keys, tokens, passwords,
 *          IP addresses, credit card numbers, SSNs, names in context.
 */

import type { UsageRecord } from './agentUsageLogger';

// ─── Patterns ─────────────────────────────────────────────────────────────────

interface ScrubRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const SCRUB_RULES: ScrubRule[] = [
  // API keys & tokens (long alphanumeric strings after key=, token=, Bearer, sk-, etc.)
  { name: 'api_key_param', pattern: /(?:api[_-]?key|token|secret|password|passwd|auth)[=:]\s*["']?[\w\-./+]{16,}["']?/gi, replacement: '[API_KEY_REDACTED]' },
  { name: 'bearer_token', pattern: /Bearer\s+[\w\-./+]{16,}/gi, replacement: 'Bearer [TOKEN_REDACTED]' },
  { name: 'sk_prefix_key', pattern: /\bsk-[A-Za-z0-9_\-]{20,}/g, replacement: '[SK_KEY_REDACTED]' },
  { name: 'gemini_key', pattern: /\bAIza[A-Za-z0-9_\-]{32,}/g, replacement: '[GEMINI_KEY_REDACTED]' },
  // Email addresses
  { name: 'email', pattern: /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, replacement: '[EMAIL_REDACTED]' },
  // Phone numbers (US and international)
  { name: 'phone', pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE_REDACTED]' },
  // Credit card numbers
  { name: 'credit_card', pattern: /\b(?:\d[ -]?){13,16}\b/g, replacement: '[CC_REDACTED]' },
  // SSN
  { name: 'ssn', pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  // IP addresses (IPv4)
  { name: 'ipv4', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
  // Private/local IPs are ok to keep for localhost references
  // URLs with credentials
  { name: 'url_creds', pattern: /https?:\/\/[^:@\s]+:[^@\s]+@/gi, replacement: 'https://[CREDS_REDACTED]@' },
  // Common env var patterns in strings
  { name: 'env_value', pattern: /(?:OPENAI|ANTHROPIC|XAI|GEMINI|GROQ|OPENROUTER|TELEGRAM|GMAIL|SMTP)[\w_]*\s*=\s*["']?[\w\-./+]{8,}["']?/gi, replacement: '[ENV_VAR_REDACTED]' },
  // Database URLs
  { name: 'db_url', pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']+/gi, replacement: '[DB_URL_REDACTED]' },
  // Private key blocks
  { name: 'pem_key', pattern: /-----BEGIN[\s\S]+?-----END[^\-]+-----/g, replacement: '[PEM_KEY_REDACTED]' },
];

// ─── Core Scrubber ────────────────────────────────────────────────────────────

export function scrubText(text: string): string {
  let result = text;
  for (const rule of SCRUB_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

export function scrubRecord(record: UsageRecord): UsageRecord {
  return {
    ...record,
    prompt: scrubText(record.prompt),
    output: scrubText(record.output),
    toolCalls: record.toolCalls?.map((tc) => ({
      ...tc,
      input: Object.fromEntries(
        Object.entries(tc.input).map(([k, v]) => [
          k,
          typeof v === 'string' ? scrubText(v) : v,
        ]),
      ),
    })),
  };
}

export function scrubBatch(records: UsageRecord[]): UsageRecord[] {
  return records.map(scrubRecord);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns any patterns that still look like sensitive data (audit check) */
export function detectResidualPII(text: string): string[] {
  const issues: string[] = [];
  for (const rule of SCRUB_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      issues.push(rule.name);
    }
  }
  return issues;
}
