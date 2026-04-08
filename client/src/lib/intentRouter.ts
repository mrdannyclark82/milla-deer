/**
 * intentRouter.ts
 * Parses user messages and returns the target dashboard section.
 * Milla uses this to auto-navigate based on what the user asks for.
 */

export type DashboardSection =
  | 'hub'
  | 'studio'
  | 'ide'
  | 'knowledge'
  | 'news'
  | 'gmail'
  | 'database'
  | 'models'
  | 'settings'
  | 'youtube'
  | 'voice'
  | 'tasks';

interface IntentRule {
  section: DashboardSection;
  patterns: RegExp[];
}

const INTENT_RULES: IntentRule[] = [
  {
    section: 'studio',
    patterns: [
      /generate\s+(an?\s+)?image/i,
      /create\s+(an?\s+)?image/i,
      /make\s+(an?\s+)?image/i,
      /draw\s+/i,
      /paint\s+/i,
      /art\s+(of|for|with)/i,
      /image\s+(of|for)/i,
      /\bstudio\b/i,
      /\bimage\s+gen/i,
      /\bcomfyui\b/i,
      /visualize\s+/i,
    ],
  },
  {
    section: 'ide',
    patterns: [
      /analyze\s+(this\s+)?code/i,
      /review\s+(this\s+)?code/i,
      /debug\s+(this|my|the)?/i,
      /run\s+(this\s+)?code/i,
      /\bsandbox\b/i,
      /\bide\b/i,
      /execute\s+/i,
      /compile\s+/i,
      /write\s+(a\s+)?(script|function|class|program)/i,
      /fix\s+(this\s+)?bug/i,
      /refactor\s+/i,
    ],
  },
  {
    section: 'knowledge',
    patterns: [
      /\bknowledge\b/i,
      /search\s+(my\s+)?notes/i,
      /look\s+up\s+/i,
      /\bwiki\b/i,
      /\bdocument/i,
      /what\s+do\s+(i|we)\s+know/i,
      /summarize\s+(my\s+)?(docs|documents|notes)/i,
    ],
  },
  {
    section: 'news',
    patterns: [
      /\bnews\b/i,
      /what('s|\s+is)\s+happening/i,
      /latest\s+(news|updates?|headlines?)/i,
      /daily\s+(digest|brief|update)/i,
      /today('s|\s+in)\s+(tech|world|news)/i,
    ],
  },
  {
    section: 'gmail',
    patterns: [
      /\bgmail\b/i,
      /\bemail\b/i,
      /check\s+(my\s+)?mail/i,
      /\binbox\b/i,
      /send\s+(an?\s+)?email/i,
      /my\s+tasks/i,
      /todo\s+list/i,
      /\breminder/i,
    ],
  },
  {
    section: 'youtube',
    patterns: [
      /\byoutube\b/i,
      /play\s+(a\s+)?video/i,
      /watch\s+/i,
      /find\s+(a\s+)?video/i,
      /video\s+(about|on|for)/i,
      /\bstream\b/i,
    ],
  },
  {
    section: 'voice',
    patterns: [
      /\bvoice\b/i,
      /\bspeak\b/i,
      /\btts\b/i,
      /text.?to.?speech/i,
      /read\s+(this\s+)?aloud/i,
      /say\s+(this|that|it)\s+out\s+loud/i,
    ],
  },
  {
    section: 'tasks',
    patterns: [
      /\btask\b/i,
      /\bschedule\b/i,
      /add\s+(a\s+)?(task|reminder|event)/i,
      /remind\s+me/i,
      /\bcalendar\b/i,
      /set\s+(a\s+)?(timer|alarm|reminder)/i,
    ],
  },
  {
    section: 'settings',
    patterns: [
      /\bsettings\b/i,
      /\bpreferences\b/i,
      /\bconfigure\b/i,
      /change\s+(my\s+)?(model|settings|theme)/i,
    ],
  },
  {
    section: 'models',
    patterns: [
      /switch\s+(to\s+)?(model|ai|gpt|claude|gemini|milla|llm)/i,
      /change\s+(the\s+)?(model|ai)/i,
      /use\s+(claude|gpt|gemini|ollama|milla|mistral)/i,
      /\bai\s+model/i,
    ],
  },
];

/**
 * Returns the target section for a given user message, or null if no intent matched
 * (meaning stay on current section / chat handles it normally).
 */
export function resolveIntent(message: string): DashboardSection | null {
  const lower = message.trim().toLowerCase();
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(lower))) {
      return rule.section;
    }
  }
  return null;
}

/**
 * Returns a brief acknowledgment message Milla says when auto-navigating.
 */
export function getNavigationAck(section: DashboardSection): string {
  const acks: Partial<Record<DashboardSection, string>> = {
    studio: 'Opening Studio — let\'s create something.',
    ide: 'Switching to the IDE Sandbox.',
    knowledge: 'Opening Knowledge Base.',
    news: 'Pulling up the Daily News Digest.',
    gmail: 'Opening Gmail & Tasks.',
    youtube: 'Loading YouTube.',
    voice: 'Opening Voice module.',
    tasks: 'Opening Tasks.',
    settings: 'Opening Settings.',
    models: 'Opening AI Model selector.',
  };
  return acks[section] ?? `Switching to ${section}.`;
}
