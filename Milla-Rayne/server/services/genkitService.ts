/**
 * genkitService.ts
 * Bridge from Milla-Rayne chat to the ogdray Genkit power-tool flow.
 * The Genkit flow server runs on port 3400 (started by ogdray/src/index.ts).
 */

const GENKIT_FLOW_URL = 'http://localhost:3400/nexusAgentFlow';
const TIMEOUT_MS = 25000;

export interface GenkitResult {
  success: boolean;
  text: string;
}

/** Returns true if the Genkit flow server is reachable */
export async function isGenkitAvailable(): Promise<boolean> {
  try {
    const res = await fetch(GENKIT_FLOW_URL, {
      method: 'HEAD',
      signal: AbortSignal.timeout(1500),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Send an instruction to the Genkit nexusAgentFlow */
export async function runGenkitFlow(instruction: string): Promise<GenkitResult> {
  try {
    const res = await fetch(GENKIT_FLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instruction),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return { success: false, text: `Genkit error ${res.status}: ${await res.text()}` };
    }

    const data = await res.json() as unknown;
    const text = typeof data === 'string' ? data : (data as { result?: string })?.result ?? JSON.stringify(data);
    return { success: true, text };
  } catch (e: unknown) {
    return { success: false, text: `Genkit unreachable: ${(e as Error).message}` };
  }
}

/**
 * Detect if a message is an action request that should route through Genkit tools.
 * Conversational messages go to the normal AI path.
 */
export function isActionRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const actionPatterns = [
    // terminal / system
    /\b(run|execute|install|uninstall|restart|reboot|kill process|check (cpu|memory|disk|ram|storage|port))\b/,
    // file ops
    /\b(read (the )?file|write (to )?file|create (a )?file|open file|delete file|edit file)\b/,
    // memory
    /\b(remember (that|this)|save (that|this|to memory)|add (to )?memory|forget (that|this))\b/,
    // web
    /\b(fetch|scrape|look up|get (the )?weather|browse|open (the )?url)\b/,
    // system stats
    /\b(system (status|stats|info)|how much (memory|ram|cpu|disk)|what('s| is) running|list processes)\b/,
    // cast (non-TV-service handled — broad fallback)
    /\b(cast (this|it|that)|play (this|it|that) on (the )?(tv|chromecast|bedroom|living room))\b/,
    // telegram
    /\b(send (me )?(a )?(text|telegram|message|notification)|text me|notify me)\b/,
  ];
  return actionPatterns.some(p => p.test(lower));
}
