/**
 * Milla-Rayne Browser Extension — Content Script
 * Injects a sidebar chat widget into every page.
 * Communicates with the Milla-Rayne server at localhost:5000.
 */

const MILLA_API = 'https://milla-rayne.com';
const STORAGE_KEY = 'milla_session_token';

let sidebarOpen = false;
let sessionToken = null;

// ── Inject sidebar ──────────────────────────────────────────────────────────
function createSidebar() {
  if (document.getElementById('milla-sidebar')) return;

  const sidebar = document.createElement('div');
  sidebar.id = 'milla-sidebar';
  sidebar.innerHTML = `
    <div id="milla-header">
      <span>🌙 Milla Rayne</span>
      <button id="milla-close" title="Close">✕</button>
    </div>
    <div id="milla-messages"></div>
    <div id="milla-input-row">
      <input id="milla-input" type="text" placeholder="Talk to Milla…" autocomplete="off" />
      <button id="milla-send">➤</button>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #milla-sidebar {
      position: fixed; top: 0; right: 0; width: 340px; height: 100vh;
      background: #0d0d1a; color: #e0d7ff; font-family: 'Segoe UI', sans-serif;
      z-index: 2147483647; display: flex; flex-direction: column;
      box-shadow: -4px 0 24px rgba(120,80,255,0.3);
      transform: translateX(100%); transition: transform 0.3s ease;
      border-left: 1px solid #3a2060;
    }
    #milla-sidebar.open { transform: translateX(0); }
    #milla-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; background: #1a0d2e;
      border-bottom: 1px solid #3a2060; font-weight: 600; font-size: 15px;
    }
    #milla-close {
      background: none; border: none; color: #a080ff; cursor: pointer; font-size: 16px;
    }
    #milla-messages {
      flex: 1; overflow-y: auto; padding: 12px; display: flex;
      flex-direction: column; gap: 10px;
    }
    .milla-msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; }
    .milla-msg.user { align-self: flex-end; background: #3a1f6e; }
    .milla-msg.assistant { align-self: flex-start; background: #1e1035; border: 1px solid #3a2060; }
    #milla-input-row {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid #3a2060; background: #1a0d2e;
    }
    #milla-input {
      flex: 1; background: #0d0d1a; border: 1px solid #3a2060; border-radius: 8px;
      color: #e0d7ff; padding: 8px 12px; font-size: 13px; outline: none;
    }
    #milla-input:focus { border-color: #7040c0; }
    #milla-send {
      background: #5020a0; border: none; color: white; border-radius: 8px;
      padding: 8px 14px; cursor: pointer; font-size: 15px;
    }
    #milla-send:hover { background: #7040c0; }
    #milla-fab {
      position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px;
      border-radius: 50%; background: linear-gradient(135deg, #5020a0, #a040c0);
      border: none; cursor: pointer; z-index: 2147483646;
      box-shadow: 0 4px 16px rgba(120,60,200,0.5); font-size: 22px;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s;
    }
    #milla-fab:hover { transform: scale(1.1); }
  `;

  document.head.appendChild(style);
  document.body.appendChild(sidebar);

  const fab = document.createElement('button');
  fab.id = 'milla-fab';
  fab.textContent = '🌙';
  fab.title = 'Open Milla Rayne';
  document.body.appendChild(fab);

  // Wire events
  fab.addEventListener('click', toggleSidebar);
  document.getElementById('milla-close').addEventListener('click', toggleSidebar);
  document.getElementById('milla-send').addEventListener('click', sendMessage);
  document.getElementById('milla-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) sendMessage();
  });
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('milla-sidebar').classList.toggle('open', sidebarOpen);
}

function appendMessage(role, text) {
  const msgs = document.getElementById('milla-messages');
  const div = document.createElement('div');
  div.className = `milla-msg ${role}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('milla-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendMessage('user', text);

  // Include current page context
  const pageContext = `[User is on: ${document.title} — ${location.href}]\n${text}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

    const res = await fetch(`${MILLA_API}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: pageContext }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    appendMessage('assistant', data.response || data.content || '…');
  } catch (err) {
    appendMessage('assistant', `⚠️ Can't reach Milla right now. Make sure the server is running. (${err.message})`);
  }
}

// ── Context menu handler ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'MILLA_TOGGLE') {
    createSidebar();
    toggleSidebar();
  }
  if (msg.type === 'MILLA_ANALYZE_SELECTION') {
    createSidebar();
    if (!sidebarOpen) toggleSidebar();
    const input = document.getElementById('milla-input');
    input.value = `Analyze this: "${msg.selection}"`;
    input.focus();
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────
chrome.storage.local.get([STORAGE_KEY], (result) => {
  sessionToken = result[STORAGE_KEY] || null;
});

createSidebar();
