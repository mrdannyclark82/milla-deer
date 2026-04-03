/**
 * SandboxChatPanel
 *
 * A floating, resizable chat overlay rendered inside the Code Sandbox.
 * Sends messages to the existing /api/chat endpoint, optionally including
 * the current file as context. Shows Milla's responses inline.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  FileCode,
  Minimize2,
  Maximize2,
  GripHorizontal,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ActiveFile {
  name: string;
  content: string;
  language: string;
}

export interface SandboxChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeFile?: ActiveFile | null;
  /** Called when Milla suggests updated code for the active file */
  onApplyCode?: (code: string) => void;
}

let _chatIdSeq = 0;
function nextId() {
  return `msg-${++_chatIdSeq}-${Date.now()}`;
}

/** Try to extract a fenced code block from Milla's response */
function extractCodeBlock(text: string): string | null {
  const fenced = text.match(/```(?:\w+\n)?([\s\S]+?)```/);
  return fenced ? fenced[1].trim() : null;
}

export const SandboxChatPanel: React.FC<SandboxChatPanelProps> = ({
  isOpen,
  onClose,
  activeFile,
  onApplyCode,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [includeFile, setIncludeFile] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => `sandbox-chat-${Date.now()}`);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, isMinimized]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    setError(null);

    // Build the message content — optionally prefix with file context
    let fullContent = trimmed;
    if (includeFile && activeFile) {
      fullContent =
        `[Context: ${activeFile.name} (${activeFile.language})]\n` +
        `\`\`\`${activeFile.language}\n${activeFile.content}\n\`\`\`\n\n` +
        trimmed;
    }

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantPlaceholder: ChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullContent,
          conversationId: sessionId,
          includeContext: true,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';

      // Handle streaming response (text/event-stream or text/plain)
      if (contentType.includes('event-stream') || contentType.includes('text/plain')) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            accumulated += chunk;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantPlaceholder.id
                  ? { ...m, content: accumulated, isStreaming: true }
                  : m
              )
            );
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholder.id
              ? { ...m, content: accumulated, isStreaming: false }
              : m
          )
        );
      } else {
        // JSON response
        const data = (await res.json()) as { response?: string; message?: string; content?: string };
        const responseText = data.response ?? data.message ?? data.content ?? 'No response';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantPlaceholder.id
              ? { ...m, content: responseText, isStreaming: false }
              : m
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages((prev) =>
        prev.filter((m) => m.id !== assistantPlaceholder.id)
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, includeFile, activeFile, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute bottom-4 right-4 z-50 flex flex-col overflow-hidden rounded-xl border border-purple-500/30 bg-[#0f0f1a]/95 shadow-2xl backdrop-blur-lg"
      style={{ width: 380, height: isMinimized ? 52 : 520 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#0a0a12]/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3 h-3 text-white/30" />
          <Bot className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Milla Chat</span>
          {activeFile && !isMinimized && (
            <Badge
              className={`ml-1 h-5 px-2 text-[10px] cursor-pointer transition-colors ${
                includeFile
                  ? 'border-green-400/30 bg-green-500/15 text-green-300 hover:bg-green-500/25'
                  : 'border-white/20 bg-white/5 text-white/40 hover:bg-white/10'
              }`}
              onClick={() => setIncludeFile((v) => !v)}
              title={includeFile ? 'File context included — click to exclude' : 'File context excluded — click to include'}
            >
              <FileCode className="w-2.5 h-2.5 mr-1" />
              {activeFile.name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && !isMinimized && (
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-white/40 hover:text-white/70"
              title="Clear history"
              onClick={clearHistory}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-white/40 hover:text-white/70"
            title={isMinimized ? 'Expand' : 'Minimize'}
            onClick={() => setIsMinimized((v) => !v)}
          >
            {isMinimized ? (
              <Maximize2 className="w-3 h-3" />
            ) : (
              <Minimize2 className="w-3 h-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-white/40 hover:text-white/70"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center">
                <Sparkles className="w-8 h-8 text-purple-400/40" />
                <div className="text-sm text-white/40">
                  Ask Milla anything about your code.
                  {activeFile && (
                    <span className="block mt-1 text-xs text-white/25">
                      {includeFile
                        ? `${activeFile.name} will be included as context.`
                        : 'File context is off — click the badge to enable.'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                    msg.role === 'user'
                      ? 'bg-purple-600/40'
                      : 'bg-cyan-600/30'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-3 h-3 text-purple-300" />
                  ) : (
                    <Bot className="w-3 h-3 text-cyan-300" />
                  )}
                </div>

                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-purple-600/20 text-purple-100 rounded-tr-sm'
                      : 'bg-white/5 text-white/85 rounded-tl-sm'
                  }`}
                >
                  {msg.isStreaming && !msg.content ? (
                    <span className="flex items-center gap-1 text-white/40">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Thinking…
                    </span>
                  ) : (
                    <>
                      <pre className="whitespace-pre-wrap break-words font-sans">
                        {msg.content}
                      </pre>
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-3 bg-current opacity-70 animate-pulse ml-0.5 align-middle" />
                      )}
                    </>
                  )}

                  {/* Apply code button — shown when Milla replies with a code block */}
                  {msg.role === 'assistant' &&
                    !msg.isStreaming &&
                    onApplyCode &&
                    extractCodeBlock(msg.content) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-6 px-2 text-[10px] text-green-300 hover:bg-green-500/15 hover:text-green-200"
                        onClick={() => {
                          const code = extractCodeBlock(msg.content);
                          if (code) onApplyCode(code);
                        }}
                      >
                        Apply to editor
                      </Button>
                    )}
                </div>
              </div>
            ))}

            {error && (
              <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-white/10 bg-[#0a0a12]/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Milla about this code…"
                className="flex-1 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-purple-500/50 focus:ring-0"
                disabled={isLoading}
              />
              <Button
                size="icon"
                className="h-8 w-8 flex-shrink-0 bg-purple-600 hover:bg-purple-500 disabled:opacity-40"
                onClick={() => void sendMessage()}
                disabled={!input.trim() || isLoading}
                title="Send (Enter)"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
