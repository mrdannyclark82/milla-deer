import { type Express, type Request, type Response } from 'express';

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — Milla-Rayne</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e2e8f0;
      line-height: 1.7;
      padding: 2rem 1rem;
    }
    .container { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #f472b6; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; margin-bottom: 2.5rem; font-size: 0.9rem; }
    h2 { font-size: 1.2rem; color: #e879f9; margin: 2rem 0 0.75rem; border-bottom: 1px solid #1e1e2e; padding-bottom: 0.4rem; }
    p, li { color: #cbd5e1; margin-bottom: 0.6rem; }
    ul { padding-left: 1.5rem; margin-bottom: 0.75rem; }
    a { color: #f472b6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      background: #1e1e2e;
      border: 1px solid #f472b620;
      border-radius: 4px;
      padding: 0.15rem 0.5rem;
      font-size: 0.8rem;
      color: #f472b6;
      margin-bottom: 1rem;
    }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #1e1e2e; color: #64748b; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <p class="subtitle">Last updated: June 2025</p>
    <span class="badge">Effective immediately for all users</span>

    <p>
      Milla-Rayne ("the Service", "we", "us") is an offline-first AI assistant. This policy explains
      what data is collected, how it is stored, and your rights as a user. We are committed to
      privacy by design — your data stays on your hardware unless you explicitly opt in to cloud features.
    </p>

    <h2>1. Data We Collect</h2>
    <p>Depending on which features you enable, the Service may process:</p>
    <ul>
      <li><strong>Conversation messages</strong> — text and voice transcripts sent to Milla-Rayne during chat sessions</li>
      <li><strong>Memory entries</strong> — facts, preferences, and context you share that Milla stores to personalise future conversations</li>
      <li><strong>OAuth tokens</strong> — if you connect Gmail or Google Calendar, we store the OAuth2 refresh token locally to maintain access; tokens are never transmitted to our servers</li>
      <li><strong>Smart home state</strong> — device names, states, and automation triggers if you configure Home Assistant integration</li>
      <li><strong>Usage metadata</strong> — anonymous feature-usage counters used to improve the product (no personally identifiable information)</li>
    </ul>

    <h2>2. How Data Is Stored</h2>
    <ul>
      <li><strong>Local by default:</strong> All conversation history and memory is stored in a SQLite database on your own device or self-hosted server (<code>memory/milla.db</code>).</li>
      <li><strong>Encryption at rest:</strong> Memory entries are encrypted with AES-256-GCM before being written to disk. The encryption key is derived from your <code>MEMORY_KEY</code> environment variable and never leaves your environment.</li>
      <li><strong>Cloud sync (opt-in only):</strong> Pro and Enterprise users may enable optional cloud backup. When enabled, encrypted ciphertext (not plaintext) is synchronised. We cannot read your memories.</li>
      <li><strong>No third-party analytics SDKs</strong> are embedded in the application.</li>
    </ul>

    <h2>3. Third-Party AI APIs</h2>
    <p>
      When you send a message, it may be forwarded to a third-party AI provider depending on your model selection.
      Providers currently supported include:
    </p>
    <ul>
      <li>Google Gemini — governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a></li>
      <li>OpenAI (GPT-4o) — governed by <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener">OpenAI Privacy Policy</a></li>
      <li>Anthropic (Claude) — governed by <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener">Anthropic Privacy Policy</a></li>
      <li>xAI (Grok) — governed by xAI's privacy policy</li>
      <li>OpenRouter — governed by <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener">OpenRouter Privacy Policy</a></li>
      <li><strong>Local Ollama / MediaPipe (on-device)</strong> — no data leaves your device</li>
    </ul>
    <p>
      We recommend using the local inference options (Gemma-3 via MediaPipe on Android, or Ollama on desktop)
      if you require full privacy. When a local model is selected, messages are never transmitted.
    </p>

    <h2>4. Google Services</h2>
    <p>
      If you connect Gmail or Google Calendar via OAuth2, the Service requests only the minimum
      necessary scopes. OAuth tokens are stored locally, never on external servers operated by us.
      You can revoke access at any time from your
      <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google Account permissions page</a>.
    </p>

    <h2>5. Telegram Integration</h2>
    <p>
      If you configure a Telegram bot token, incoming messages from your configured chat are forwarded
      to Milla for processing and a reply is returned. No Telegram messages are stored beyond the
      normal conversation memory (subject to the encryption and retention rules above).
    </p>

    <h2>6. Cookies</h2>
    <p>
      The web application uses a single session cookie for authentication. No tracking or advertising
      cookies are used. The browser extension does not collect browsing history.
    </p>

    <h2>7. Data Retention</h2>
    <p>
      Data is retained until you delete it. You can clear all memory at any time from the Settings
      page or by deleting the local database file. There is no minimum retention period.
    </p>

    <h2>8. Your Rights</h2>
    <ul>
      <li><strong>Access:</strong> All your data is in the local SQLite database — you can inspect it directly.</li>
      <li><strong>Deletion:</strong> Delete individual memories from Settings → Memory, or wipe the database entirely.</li>
      <li><strong>Portability:</strong> Export your conversation history and memories as JSON from the Settings page.</li>
      <li><strong>Correction:</strong> Edit or overwrite any stored memory entry directly in the UI.</li>
    </ul>

    <h2>9. Children's Privacy</h2>
    <p>
      The Service is not directed at children under 13. We do not knowingly collect personal
      information from children. If you believe a child has provided personal information, please
      contact us and we will take steps to delete it.
    </p>

    <h2>10. Changes to This Policy</h2>
    <p>
      We may update this policy as new features are added. The "Last updated" date at the top
      of this page will reflect any changes. For significant changes we will post a notice in
      the application.
    </p>

    <h2>11. Contact</h2>
    <p>
      Questions, concerns, or data requests: <a href="mailto:mrdannyclark82@gmail.com">mrdannyclark82@gmail.com</a>
    </p>

    <footer>
      &copy; 2025 Milla-Rayne &mdash; <a href="/">Home</a> &mdash; <a href="https://github.com/mrdannyclark82/Milla-Deer">GitHub</a>
    </footer>
  </div>
</body>
</html>`;

export function registerPrivacyRoutes(app: Express): void {
  app.get('/privacy', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(PRIVACY_HTML);
  });
}
