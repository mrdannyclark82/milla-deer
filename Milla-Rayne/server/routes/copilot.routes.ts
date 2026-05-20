/**
 * Copilot Review Route
 *
 * Milla (or any agent) can POST here to get a structured code/architecture
 * review back. Acts as Copilot's official "intake" endpoint.
 *
 * POST /api/copilot/review
 *   Body: { files?: string[], context: string, type?: 'code' | 'architecture' | 'security' }
 *   Returns: { verdict, issues, suggestions, approved }
 */

import { type Express } from 'express';
import { generateAIResponse } from '../services/chatOrchestrator.service';
import { notifyDanny } from '../services/telegramBotService';

export function registerCopilotRoutes(app: Express) {
  app.post('/api/copilot/review', async (req, res) => {
    const { files = [], context = '', type = 'code' } = req.body as {
      files?: string[];
      context?: string;
      type?: 'code' | 'architecture' | 'security';
    };

    if (!context && files.length === 0) {
      res.status(400).json({ error: 'Provide context or files to review' });
      return;
    }

    const prompt = [
      `You are Copilot, the Architect and Code Reviewer for the Milla-Rayne project.`,
      `Review type: ${type}`,
      context ? `Context: ${context}` : '',
      files.length > 0 ? `Files involved: ${files.join(', ')}` : '',
      `Return a structured review with:`,
      `- verdict: 'approved' | 'needs_changes' | 'blocked'`,
      `- issues: string[] (specific problems found)`,
      `- suggestions: string[] (actionable improvements)`,
      `- summary: one sentence`,
      `Respond in JSON only.`,
    ].filter(Boolean).join('\n');

    try {
      const raw = await generateAIResponse(prompt, 'copilot-reviewer', {
        bypassFunctionCalls: true,
      });

      // Parse JSON from response
      const jsonMatch = raw.content.match(/\{[\s\S]*\}/);
      const review = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        verdict: 'needs_changes',
        issues: [],
        suggestions: [raw.content],
        summary: 'Review complete',
      };

      // Notify Danny if blocked
      if (review.verdict === 'blocked') {
        notifyDanny(`🚫 Copilot BLOCKED a ${type} review\n${review.summary}\nIssues: ${review.issues?.slice(0,2).join(', ')}`).catch(() => {});
      }

      res.json({ review });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Quick health check — lets Milla verify Copilot is reachable
  app.get('/api/copilot/status', (_req, res) => {
    res.json({ status: 'online', role: 'Architect & Code Reviewer', model: 'claude-sonnet-4.6' });
  });
}
