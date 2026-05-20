/**
 * Milla-Rayne Browser Extension — Service Worker
 * Handles context menus and cross-tab messaging.
 */

const CONTEXT_MENU_ID = 'milla-analyze-selection';

// ── Setup context menu on install ────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Ask Milla about "%s"',
    contexts: ['selection'],
  });
});

// ── Context menu click ────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'MILLA_ANALYZE_SELECTION',
      selection: info.selectionText.trim().slice(0, 2000),
    });
  }
});

// ── Keyboard shortcut (Alt+M) via commands API ───────────────────────────────
chrome.commands?.onCommand?.addListener((command, tab) => {
  if (command === 'toggle-milla') {
    chrome.tabs.sendMessage(tab.id, { type: 'MILLA_TOGGLE' });
  }
});
