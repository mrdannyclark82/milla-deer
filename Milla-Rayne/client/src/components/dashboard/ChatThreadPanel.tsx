import {
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type MessageChannelFilter = 'all' | 'web' | 'gmail';

interface Message {
  id?: string;
  role: string;
  content: string;
  image?: string;
  displayRole?: string | null;
  channel?: string | null;
  sourcePlatform?: string | null;
  timestamp?: string | null;
}

const DEFAULT_GREETING: Message = {
  role: 'assistant',
  content:
    "Hello! I'm Milla. I'm online and synced with your hub. How can I assist you today?",
  displayRole: 'Milla Rayne',
  channel: 'web',
  sourcePlatform: 'milla-hub',
};

const CHANNEL_FILTERS: Array<{
  id: MessageChannelFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web' },
  { id: 'gmail', label: 'Gmail' },
];

function parseStoredMessage(message: {
  id?: string;
  role: string;
  content: string;
  displayRole?: string | null;
  channel?: string | null;
  sourcePlatform?: string | null;
  timestamp?: string | null;
}): Message {
  const imageMatch = message.content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  const cleanedContent = message.content
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '')
    .trim();

  return {
    id: message.id,
    role: message.role,
    content: cleanedContent || message.content,
    image: imageMatch?.[1],
    displayRole: message.displayRole ?? null,
    channel: message.channel ?? 'web',
    sourcePlatform: message.sourcePlatform ?? null,
    timestamp: message.timestamp ?? null,
  };
}

function getMessageKey(message: Message): string {
  return [
    message.id ?? '',
    message.role,
    message.content,
    message.image ?? '',
    message.displayRole ?? '',
    message.channel ?? '',
    message.sourcePlatform ?? '',
    message.timestamp ?? '',
  ].join(':');
}

function areMessagesEqual(current: Message[], next: Message[]): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every(
    (message, index) => getMessageKey(message) === getMessageKey(next[index])
  );
}

function isLocalUserMessage(message: Message): boolean {
  return message.role === 'user' && (message.channel || 'web') === 'web';
}

function getSenderLabel(message: Message): string {
  if (message.displayRole?.trim()) {
    return message.displayRole.trim();
  }

  if (message.role === 'assistant') {
    return 'Milla Rayne';
  }

  return 'You';
}

function getAvatarText(message: Message): string {
  if (message.role === 'assistant') {
    return 'M';
  }

  if (isLocalUserMessage(message)) {
    return 'You';
  }

  const label = getSenderLabel(message).replace(/[^a-z0-9]/gi, '');
  return (label[0] || '?').toUpperCase();
}

function getChannelBadgeLabel(message: Message): string {
  const channel = message.channel || 'web';
  const source = message.sourcePlatform?.trim();

  if (source && source.toLowerCase() !== channel.toLowerCase()) {
    return `${channel} • ${source}`;
  }

  return channel;
}

function getTimestampLabel(message: Message): string {
  if (!message.timestamp) {
    return '';
  }

  const parsed = new Date(message.timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatThreadPanel({
  onPlayVideo,
}: {
  onPlayVideo?: (videoId: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([DEFAULT_GREETING]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeChannel, setActiveChannel] =
    useState<MessageChannelFilter>('all');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageKeyRef = useRef<string | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      return true;
    }

    return (
      container.scrollHeight - container.scrollTop - container.clientHeight < 80
    );
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  };

  const loadMessages = useCallback(async () => {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    try {
      setIsRefreshing(true);
      const response = await fetch('/api/messages?limit=80');
      if (!response.ok) return;

      const data = await response.json();
      if (!Array.isArray(data)) return;

      const nextMessages = data.map(parseStoredMessage);
      const normalizedMessages =
        nextMessages.length > 0 ? nextMessages : [DEFAULT_GREETING];

      shouldAutoScrollRef.current = isNearBottom();
      setMessages((currentMessages) =>
        areMessagesEqual(currentMessages, normalizedMessages)
          ? currentMessages
          : normalizedMessages
      );
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const channelCounts = useMemo(() => {
    return messages.reduce(
      (counts, message) => {
        const channel = message.channel || 'web';
        counts.all += 1;
        if (channel === 'gmail') {
          counts.gmail += 1;
        } else {
          counts.web += 1;
        }
        return counts;
      },
      { all: 0, web: 0, gmail: 0 }
    );
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (activeChannel === 'all') {
      return messages;
    }

    return messages.filter(
      (message) => (message.channel || 'web') === activeChannel
    );
  }, [activeChannel, messages]);

  useEffect(() => {
    const nextLastMessage = visibleMessages[visibleMessages.length - 1];
    const nextLastMessageKey = nextLastMessage
      ? getMessageKey(nextLastMessage)
      : null;
    const isInitialRender = lastMessageKeyRef.current === null;

    if (
      nextLastMessageKey !== lastMessageKeyRef.current &&
      (shouldAutoScrollRef.current || isInitialRender)
    ) {
      scrollToBottom(isInitialRender ? 'auto' : 'smooth');
    }

    lastMessageKeyRef.current = nextLastMessageKey;
    shouldAutoScrollRef.current = false;
  }, [visibleMessages]);

  useEffect(() => {
    let isMounted = true;

    const guardedLoad = async () => {
      if (!isMounted) {
        return;
      }
      await loadMessages();
    };

    const handleWindowFocus = () => {
      void guardedLoad();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void guardedLoad();
      }
    };

    void guardedLoad();
    const intervalId = window.setInterval(guardedLoad, 15000);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadMessages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;

    const userMsg = inputValue.trim();
    setInputValue('');
    setIsSending(true);
    shouldAutoScrollRef.current = true;

    if (activeChannel === 'gmail') {
      setActiveChannel('all');
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMsg }),
      });

      const data = await response.json();

      if (data.response || data.content) {
        await loadMessages();

        if (data.youtube_play && data.youtube_play.videoId && onPlayVideo) {
          onPlayVideo(data.youtube_play.videoId);
        }
      } else if (data.error) {
        shouldAutoScrollRef.current = true;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${data.error}`,
            displayRole: 'Milla Rayne',
            channel: 'web',
            sourcePlatform: 'milla-hub',
          },
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      shouldAutoScrollRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm having trouble connecting to my neural network right now. Please try again.",
          displayRole: 'Milla Rayne',
          channel: 'web',
          sourcePlatform: 'milla-hub',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="relative flex h-[500px] flex-col overflow-hidden rounded-2xl border border-[#00f2ff]/20 bg-white/5 backdrop-blur-2xl shadow-[0_0_35px_rgba(0,242,255,0.12),0_25px_120px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#00f2ff]/8 via-transparent to-[#7c3aed]/10" />
      <div className="absolute -left-12 top-10 h-28 w-28 rounded-full bg-[#00f2ff]/10 blur-3xl" />
      <div className="absolute -right-10 bottom-10 h-32 w-32 rounded-full bg-[#ff00aa]/10 blur-3xl" />

      <div className="relative z-10 border-b border-white/5 bg-white/5 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#00f2ff] to-[#7c3aed] shadow-[0_0_15px_rgba(0,242,255,0.3)]">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Live Thread</h3>
              <p className="text-[10px] text-white/50">
                Hub + Gmail memory stream
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadMessages()}
            className="rounded-lg p-2 text-white/45 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Refresh thread"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CHANNEL_FILTERS.map((filter) => {
            const count = channelCounts[filter.id];
            const isActive = activeChannel === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveChannel(filter.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'border-[#00f2ff]/50 bg-[#00f2ff]/15 text-[#9beeff]'
                    : 'border-white/10 bg-white/5 text-white/55 hover:border-white/20 hover:text-white/85'
                }`}
              >
                {filter.label} <span className="text-white/45">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="relative z-10 flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      >
        <div className="space-y-6">
          {visibleMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-sm text-white/45">
              No {activeChannel === 'all' ? '' : `${activeChannel} `}messages in
              this window yet.
            </div>
          ) : (
            visibleMessages.map((msg, idx) => {
              const localUser = isLocalUserMessage(msg);
              const assistant = msg.role === 'assistant';
              const senderLabel = getSenderLabel(msg);
              const timestampLabel = getTimestampLabel(msg);

              return (
                <div
                  key={msg.id || `${getMessageKey(msg)}:${idx}`}
                  className={`flex gap-4 ${localUser ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      assistant
                        ? 'bg-gradient-to-tr from-[#00f2ff] to-[#7c3aed] shadow-[0_0_10px_rgba(124,58,237,0.3)]'
                        : localUser
                          ? 'bg-white/10'
                          : 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/25'
                    }`}
                  >
                    {getAvatarText(msg)}
                  </div>

                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      assistant
                        ? 'rounded-tl-none border border-white/10 bg-white/5 text-white/90 shadow-sm'
                        : localUser
                          ? 'rounded-tr-none border border-[#7c3aed]/30 bg-[#7c3aed]/20 text-white shadow-[0_0_15px_rgba(124,58,237,0.1)]'
                          : 'rounded-tl-none border border-amber-400/20 bg-amber-500/10 text-white/85'
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                      <span className="text-white/65 normal-case tracking-normal">
                        {senderLabel}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px]">
                        {getChannelBadgeLabel(msg)}
                      </span>
                      {timestampLabel ? <span>{timestampLabel}</span> : null}
                    </div>

                    <div>{msg.content}</div>

                    {msg.image && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                        <img
                          src={msg.image}
                          alt="Generated content"
                          className="max-h-[300px] w-full object-contain bg-black/20"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isSending && (
            <div className="flex gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-[#00f2ff] to-[#7c3aed] shadow-[0_0_10px_rgba(124,58,237,0.3)]">
                <span className="text-xs font-bold text-white">M</span>
              </div>
              <div className="rounded-2xl rounded-tl-none border border-white/10 bg-white/5 px-4 py-3">
                <div className="space-y-3">
                  <div className="text-xs text-white/50">Thinking...</div>
                  <div className="flex gap-1">
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 border-t border-white/5 bg-white/[0.02] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-white/40">
          <Mail className="h-3.5 w-3.5" />
          Replies here still send to the Hub chat, while Gmail items are shown as shared memory context.
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 transition-all focus-within:border-[#00f2ff]/50 focus-within:bg-white/10">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Milla..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            disabled={isSending}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending}
            className={`rounded-lg p-2 transition-colors ${
              !inputValue.trim() || isSending
                ? 'text-white/20'
                : 'text-[#00f2ff] hover:bg-[#00f2ff]/10'
            }`}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
