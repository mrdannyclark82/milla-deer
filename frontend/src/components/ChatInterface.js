import React, { useState, useRef, useEffect, useCallback } from 'react';
import API from '../api';
import { Send, Mic, MicOff, Trash2, MessageSquare, Box, Youtube, Brain } from 'lucide-react';

const TOOL_MODES = [
  { id: 'chat', label: 'Chat', icon: Brain },
  { id: 'holo', label: 'Holo', icon: Box },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
];

function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  return html;
}

export default function ChatInterface({ persona, onSpeakingChange, onHologramScene, onYouTubeVideo, toolMode, setToolMode }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [streamingId, setStreamingId] = useState(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const { data } = await API.get('/api/chat/history');
      if (data.length > 0) {
        setMessages(data.map((m, i) => ({
          id: i, role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content, timestamp: m.timestamp
        })));
      } else {
        setMessages([{
          id: 0, role: 'assistant',
          content: 'Holographic interface initialized. Connection secure. How can I assist you today?',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (e) {
      setMessages([{
        id: 0, role: 'assistant',
        content: 'Welcome to Elara AI. Ready for your commands.',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const sendStreamingMessage = useCallback(async (userText) => {
    const aiMsgId = Date.now() + 1;
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', timestamp: new Date().toISOString(), streaming: true }]);
    setStreamingId(aiMsgId);
    onSpeakingChange(true);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: userText, persona, tool_mode: toolMode }),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'chunk') {
                setMessages(prev => prev.map(m =>
                  m.id === aiMsgId ? { ...m, content: data.content } : m
                ));
              } else if (data.type === 'done') {
                setMessages(prev => prev.map(m =>
                  m.id === aiMsgId ? { ...m, content: data.content, timestamp: data.timestamp, streaming: false } : m
                ));
              }
            } catch (e) { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: 'Connection interrupted. Please try again.', streaming: false } : m
        ));
      }
    } finally {
      setStreamingId(null);
      setLoading(false);
      onSpeakingChange(false);
      abortRef.current = null;
    }
  }, [persona, toolMode, onSpeakingChange]);

  const sendHologramRequest = useCallback(async (userText) => {
    try {
      const { data } = await API.post('/api/hologram', { prompt: userText });
      if (data && data.elements) {
        onHologramScene(data);
        setMessages(prev => [...prev, {
          id: Date.now() + 1, role: 'assistant',
          content: `**Holographic Projection:** ${data.title || 'Scene Generated'}\n\n${data.description || 'Interactive 3D scene loaded above.'}`,
          timestamp: new Date().toISOString(),
          holoScene: data,
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        content: 'Hologram generation failed. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
      onSpeakingChange(false);
    }
  }, [onHologramScene, onSpeakingChange]);

  const sendYouTubeSearch = useCallback(async (userText) => {
    try {
      const { data } = await API.post('/api/youtube/search', { query: userText });
      if (data.videos && data.videos.length > 0) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, role: 'assistant',
          content: `Found ${data.videos.length} videos for "${userText}":`,
          timestamp: new Date().toISOString(),
          videos: data.videos,
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, role: 'assistant',
          content: `No videos found for "${userText}". Try a different search.`,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: 'assistant',
        content: 'YouTube search failed. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
      onSpeakingChange(false);
    }
  }, [onSpeakingChange]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    const userMsg = { id: Date.now(), role: 'user', content: userText, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    onSpeakingChange(true);

    if (toolMode === 'holo') {
      await sendHologramRequest(userText);
    } else if (toolMode === 'youtube') {
      await sendYouTubeSearch(userText);
    } else {
      await sendStreamingMessage(userText);
    }
  }, [input, loading, toolMode, onSpeakingChange, sendStreamingMessage, sendHologramRequest, sendYouTubeSearch]);

  const handleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    setIsListening(true);
    recognition.onresult = (e) => {
      setInput(prev => prev ? `${prev} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const clearChat = async () => {
    try {
      await API.delete('/api/chat/history');
      setMessages([{ id: 0, role: 'assistant', content: 'Memory purged. Ready for new session.', timestamp: new Date().toISOString() }]);
    } catch (e) { /* ignore */ }
  };

  const placeholders = {
    chat: 'Ask Elara anything...',
    holo: 'Describe a holographic scene...',
    youtube: 'Search YouTube videos...',
  };

  return (
    <div data-testid="chat-interface" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 16px 16px' }}>
      {/* Tool mode selector */}
      <div data-testid="tool-selector" style={{ display: 'flex', gap: 4, padding: '8px 0', flexShrink: 0 }}>
        {TOOL_MODES.map(mode => {
          const Icon = mode.icon;
          return (
            <button
              data-testid={`tool-${mode.id}`}
              key={mode.id}
              onClick={() => setToolMode(mode.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
                background: toolMode === mode.id ? 'var(--primary)' : 'var(--glass)',
                color: toolMode === mode.id ? 'var(--bg)' : 'var(--text-muted)',
                border: toolMode === mode.id ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                cursor: 'pointer', transition: 'all 0.2s',
                fontWeight: toolMode === mode.id ? 600 : 400,
              }}
            >
              <Icon size={13} /> {mode.label}
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <div data-testid="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }} className="fade-in">
            <div data-testid={`chat-message-${msg.role}`} style={{
              maxWidth: '80%', padding: '14px 18px', borderRadius: 12,
              background: msg.role === 'user' ? 'var(--chat-user)' : 'var(--chat-ai)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  {msg.role === 'user' ? 'You' : 'Elara'}
                </span>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div className="markdown-content" style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              
              {/* Streaming cursor */}
              {msg.streaming && (
                <span style={{ display: 'inline-block', width: 8, height: 16, background: 'var(--primary)', animation: 'pulseGlow 0.8s ease infinite', marginLeft: 2, verticalAlign: 'text-bottom', borderRadius: 1 }} />
              )}

              {/* YouTube video results */}
              {msg.videos && msg.videos.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {msg.videos.map((vid, i) => (
                    <button
                      data-testid={`youtube-result-${i}`}
                      key={i}
                      onClick={() => onYouTubeVideo(vid)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                        borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', width: '100%',
                      }}
                    >
                      <div style={{
                        width: 48, height: 36, borderRadius: 4, overflow: 'hidden', flexShrink: 0,
                        background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <img
                          src={`https://img.youtube.com/vi/${vid.id}/mqdefault.jpg`}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {vid.title}
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {vid.channel}
                        </p>
                      </div>
                      <Youtube size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && !streamingId && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--chat-ai)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulseGlow 1s ease infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulseGlow 1s ease infinite 0.2s' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulseGlow 1s ease infinite 0.4s' }} />
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', marginLeft: 8 }}>
                  {toolMode === 'holo' ? 'Generating hologram...' : toolMode === 'youtube' ? 'Searching...' : 'Thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button data-testid="clear-chat-btn" onClick={clearChat} title="Clear chat" style={{
          width: 42, height: 42, borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--glass-border)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          transition: 'all 0.2s', flexShrink: 0,
        }}>
          <Trash2 size={16} />
        </button>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--glass)', backdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border)', borderRadius: 12,
          padding: '4px 8px',
        }}>
          <MessageSquare size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }} />
          <input
            data-testid="chat-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={isListening ? 'Listening...' : placeholders[toolMode] || 'Ask Elara anything...'}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--fg)', fontSize: 14, fontFamily: 'Manrope', padding: '10px 4px',
            }}
          />

          <button data-testid="voice-btn" onClick={handleVoice} style={{
            width: 36, height: 36, borderRadius: 8,
            background: isListening ? 'rgba(239,68,68,0.15)' : 'transparent',
            border: isListening ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
            color: isListening ? '#ef4444' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            transition: 'all 0.2s', flexShrink: 0,
          }}>
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <button data-testid="send-btn" onClick={sendMessage} disabled={!input.trim() || loading} style={{
            width: 36, height: 36, borderRadius: 8,
            background: input.trim() ? 'var(--primary)' : 'var(--surface)',
            border: 'none',
            color: input.trim() ? 'var(--bg)' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input.trim() ? 'pointer' : 'default',
            transition: 'all 0.2s', flexShrink: 0,
          }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
