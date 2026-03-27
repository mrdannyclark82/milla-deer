const MILLA_API = 'http://localhost:5000';

async function checkServer() {
  const dot = document.getElementById('server-dot');
  const text = document.getElementById('status-text');
  try {
    const res = await fetch(`${MILLA_API}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok || res.status === 404) {
      dot.className = 'dot green';
      text.textContent = 'Server connected ✓';
    } else {
      dot.className = 'dot yellow';
      text.textContent = `Server error (${res.status})`;
    }
  } catch {
    dot.className = 'dot red';
    text.textContent = 'Server offline';
  }
}

document.getElementById('open-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'MILLA_TOGGLE' });
  window.close();
});

document.getElementById('settings-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: `${MILLA_API}/settings` });
});

checkServer();
