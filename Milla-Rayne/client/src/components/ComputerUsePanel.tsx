import { useState, useRef, useCallback } from 'react';
import {
  Camera,
  MousePointer2,
  Type,
  Keyboard,
  Scroll,
  Maximize2,
  ScanText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Terminal,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  ts: string;
  kind: 'info' | 'success' | 'error' | 'image';
  message: string;
  dataUrl?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function api<T = unknown>(
  method: 'POST' | 'GET',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`/api/computer-use/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ComputerUsePanel() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastDataUrl, setLastDataUrl] = useState<string | null>(null);

  // Inputs
  const [mouseX, setMouseX] = useState('');
  const [mouseY, setMouseY] = useState('');
  const [typeText, setTypeText] = useState('');
  const [keyCombo, setKeyCombo] = useState('');
  const [scrollDir, setScrollDir] = useState<'up' | 'down'>('down');
  const [scrollClicks, setScrollClicks] = useState('3');

  const counter = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const push = useCallback((kind: LogEntry['kind'], message: string, dataUrl?: string) => {
    const entry: LogEntry = {
      id: ++counter.current,
      ts: new Date().toLocaleTimeString(),
      kind,
      message,
      dataUrl,
    };
    setLog((prev) => [...prev.slice(-199), entry]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
  }, []);

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      push('info', `▶ ${label}`);
      try {
        const result = await fn();
        return result;
      } catch (err) {
        push('error', `✗ ${label}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [push]
  );

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleScreenshot = () =>
    run('Screenshot', async () => {
      const data = await api<{ success: boolean; dataUrl?: string; width?: number; height?: number; error?: string }>(
        'POST', 'screenshot'
      );
      if (data.success && data.dataUrl) {
        setLastDataUrl(data.dataUrl);
        push('image', `Screenshot captured (${data.width}×${data.height})`, data.dataUrl);
      } else {
        push('error', `Screenshot failed: ${data.error}`);
      }
    });

  const handleOCR = () =>
    run('OCR', async () => {
      const data = await api<{ success: boolean; text?: string; error?: string }>(
        'POST', 'ocr', lastDataUrl ? { dataUrl: lastDataUrl } : {}
      );
      if (data.success) {
        push('success', `OCR result: ${data.text || '(no text found)'}`);
      } else {
        push('error', `OCR failed: ${data.error}`);
      }
    });

  const handleScreenSize = () =>
    run('Screen size', async () => {
      const data = await api<{ success: boolean; width?: number; height?: number; error?: string }>(
        'GET', 'screen-size'
      );
      if (data.success) {
        push('success', `Screen: ${data.width}×${data.height}`);
      } else {
        push('error', `Screen size failed: ${data.error}`);
      }
    });

  const handleMousePosition = () =>
    run('Mouse position', async () => {
      const data = await api<{ success: boolean; x?: number; y?: number; note?: string; error?: string }>(
        'GET', 'mouse-position'
      );
      if (data.success) {
        push('success', `Mouse: (${data.x}, ${data.y})${data.note ? ` — ${data.note}` : ''}`);
      } else {
        push('error', `Mouse position failed: ${data.error}`);
      }
    });

  const handleMouseMove = () => {
    const x = parseInt(mouseX, 10);
    const y = parseInt(mouseY, 10);
    if (isNaN(x) || isNaN(y)) { push('error', 'Invalid coordinates'); return; }
    run('Move mouse', async () => {
      const data = await api<{ success: boolean; error?: string }>('POST', 'move-mouse', { x, y });
      if (data.success) push('success', `Mouse moved to (${x}, ${y})`);
      else push('error', `Move failed: ${data.error}`);
    });
  };

  const handleClick = () => {
    const x = mouseX ? parseInt(mouseX, 10) : undefined;
    const y = mouseY ? parseInt(mouseY, 10) : undefined;
    run('Click', async () => {
      const data = await api<{ success: boolean; error?: string }>('POST', 'click', { x, y });
      if (data.success) push('success', `Clicked at (${x ?? 'center'}, ${y ?? 'center'})`);
      else push('error', `Click failed: ${data.error}`);
    });
  };

  const handleType = () => {
    if (!typeText.trim()) { push('error', 'No text to type'); return; }
    run('Type text', async () => {
      const data = await api<{ success: boolean; error?: string }>('POST', 'type', { text: typeText });
      if (data.success) push('success', `Typed: "${typeText}"`);
      else push('error', `Type failed: ${data.error}`);
    });
  };

  const handleKey = () => {
    if (!keyCombo.trim()) { push('error', 'No key specified'); return; }
    run(`Key: ${keyCombo}`, async () => {
      const data = await api<{ success: boolean; error?: string }>('POST', 'press-key', { key: keyCombo });
      if (data.success) push('success', `Pressed key: ${keyCombo}`);
      else push('error', `Key failed: ${data.error}`);
    });
  };

  const handleScroll = () =>
    run(`Scroll ${scrollDir}`, async () => {
      const data = await api<{ success: boolean; error?: string }>('POST', 'scroll', {
        direction: scrollDir,
        amount: parseInt(scrollClicks, 10) || 3,
      });
      if (data.success) push('success', `Scrolled ${scrollDir}`);
      else push('error', `Scroll failed: ${data.error}`);
    });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900 min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-700 pb-3">
        <Terminal className="text-violet-400" size={22} />
        <h1 className="text-lg font-semibold text-violet-300">Computer Use</h1>
        {busy && <Loader2 className="ml-auto animate-spin text-violet-400" size={18} />}
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Screenshot / OCR / Screen Info */}
        <section className="bg-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Camera size={15} className="text-violet-400" /> Capture
          </h2>
          <div className="flex flex-wrap gap-2">
            <Btn icon={<Camera size={14} />} label="Screenshot" onClick={handleScreenshot} disabled={busy} />
            <Btn icon={<ScanText size={14} />} label="OCR" onClick={handleOCR} disabled={busy} />
            <Btn icon={<Maximize2 size={14} />} label="Screen Size" onClick={handleScreenSize} disabled={busy} />
            <Btn icon={<MousePointer2 size={14} />} label="Mouse Pos" onClick={handleMousePosition} disabled={busy} />
          </div>
        </section>

        {/* Mouse */}
        <section className="bg-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <MousePointer2 size={15} className="text-violet-400" /> Mouse
          </h2>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="X"
              value={mouseX}
              onChange={(e) => setMouseX(e.target.value)}
              className="w-20 px-2 py-1.5 bg-zinc-700 rounded-lg text-sm border border-zinc-600 focus:border-violet-500 outline-none"
            />
            <input
              type="number"
              placeholder="Y"
              value={mouseY}
              onChange={(e) => setMouseY(e.target.value)}
              className="w-20 px-2 py-1.5 bg-zinc-700 rounded-lg text-sm border border-zinc-600 focus:border-violet-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <Btn label="Move" onClick={handleMouseMove} disabled={busy} />
            <Btn label="Click" onClick={handleClick} disabled={busy} />
          </div>
        </section>

        {/* Keyboard */}
        <section className="bg-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Type size={15} className="text-violet-400" /> Keyboard
          </h2>
          <input
            type="text"
            placeholder="Text to type…"
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleType()}
            className="w-full px-3 py-1.5 bg-zinc-700 rounded-lg text-sm border border-zinc-600 focus:border-violet-500 outline-none"
          />
          <Btn icon={<Type size={14} />} label="Type Text" onClick={handleType} disabled={busy} />

          <div className="flex gap-2 items-center mt-1">
            <input
              type="text"
              placeholder="Key (e.g. Enter, Control+A)"
              value={keyCombo}
              onChange={(e) => setKeyCombo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleKey()}
              className="flex-1 px-3 py-1.5 bg-zinc-700 rounded-lg text-sm border border-zinc-600 focus:border-violet-500 outline-none"
            />
            <Btn icon={<Keyboard size={14} />} label="Press" onClick={handleKey} disabled={busy} />
          </div>
        </section>

        {/* Scroll */}
        <section className="bg-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Scroll size={15} className="text-violet-400" /> Scroll
          </h2>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setScrollDir('up')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border transition ${
                scrollDir === 'up'
                  ? 'bg-violet-700 border-violet-500 text-white'
                  : 'bg-zinc-700 border-zinc-600 text-zinc-300 hover:border-violet-500'
              }`}
            >
              <ChevronUp size={14} /> Up
            </button>
            <button
              onClick={() => setScrollDir('down')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border transition ${
                scrollDir === 'down'
                  ? 'bg-violet-700 border-violet-500 text-white'
                  : 'bg-zinc-700 border-zinc-600 text-zinc-300 hover:border-violet-500'
              }`}
            >
              <ChevronDown size={14} /> Down
            </button>
            <input
              type="number"
              placeholder="Clicks"
              value={scrollClicks}
              min={1}
              max={20}
              onChange={(e) => setScrollClicks(e.target.value)}
              className="w-16 px-2 py-1.5 bg-zinc-700 rounded-lg text-sm border border-zinc-600 focus:border-violet-500 outline-none"
            />
            <Btn label="Scroll" onClick={handleScroll} disabled={busy} />
          </div>
        </section>
      </div>

      {/* Screenshot preview */}
      {lastDataUrl && (
        <section className="bg-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
            <Camera size={15} className="text-violet-400" /> Last Screenshot
          </h2>
          <img
            src={lastDataUrl}
            alt="Last screenshot"
            className="max-w-full rounded-lg border border-zinc-700 max-h-96 object-contain"
          />
        </section>
      )}

      {/* Log */}
      <section className="bg-zinc-800 rounded-xl p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Terminal size={15} className="text-violet-400" /> Output
          </h2>
          <button
            onClick={() => setLog([])}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            Clear
          </button>
        </div>
        <div
          ref={logRef}
          className="h-52 overflow-y-auto font-mono text-xs space-y-1 pr-1"
        >
          {log.length === 0 && (
            <p className="text-zinc-600 italic">No output yet — run an action above.</p>
          )}
          {log.map((entry) => (
            <div key={entry.id} className="flex gap-2">
              <span className="text-zinc-600 shrink-0">{entry.ts}</span>
              <span
                className={
                  entry.kind === 'error'
                    ? 'text-red-400'
                    : entry.kind === 'success'
                    ? 'text-emerald-400'
                    : entry.kind === 'image'
                    ? 'text-violet-300'
                    : 'text-zinc-300'
                }
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Reusable button ─────────────────────────────────────────────────────────

function Btn({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
    >
      {icon}
      {label}
    </button>
  );
}
