import React, { useState, useRef, useEffect, useCallback } from 'react';
import API from '../api';
import { Send, Mic, MicOff, Trash2, MessageSquare } from 'lucide-react';

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

export default function ChatInterface({ persona, onSpeakingChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

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
        setMessages(data.map((m, i) => ({ id: i, role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content, timestamp: m.timestamp })));
      } else {
        setMessages([{ id: 0, role: 'assistant', content: 'Holographic interface initialized. Connection secure. How can I assist you today?', timestamp: new Date().toISOString() }]);
      }
    } catch {
      setMessages([{ id: 0, role: 'assistant', content: 'Welcome to Elara AI. Ready for your commands.', timestamp: new Date().toISOString() }]);
    }
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    const userMsg = { id: Date.now(), role: 'user', content: userText, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    onSpeakingChange(true);

    try {
      const { data } = await API.post('/api/chat', { message: userText, persona });
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: data.content, timestamp: data.timestamp }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: 'System error. Please try again.', timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      onSpeakingChange(false);
    }
  }, [input, loading, persona, onSpeakingChange]);

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

  return (
    <div data-testid="chat-interface" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 16px 16px' }}>
      {/* Messages */}
      <div data-testid="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <div className="markdown-content" style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'var(--chat-ai)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulseGlow 1s ease infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulseGlow 1s ease infinite 0.2s' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulseGlow 1s ease infinite 0.4s' }} />
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', marginLeft: 8 }}>Thinking...</span>
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
            placeholder={isListening ? 'Listening...' : 'Ask Elara anything...'}
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
