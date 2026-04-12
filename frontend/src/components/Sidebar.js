import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import API from '../api';
import MetricsRadar from './MetricsRadar';
import { LogOut, Moon, Sun, Zap, Sparkles, User, BookOpen, Activity, X, Palette, ChevronDown } from 'lucide-react';

const PERSONAS = ['Professional', 'Casual', 'Empathetic', 'Humorous', 'Motivational'];

export default function Sidebar({ persona, setPersona, onClose }) {
  const { user, logout } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const [metrics, setMetrics] = useState(null);
  const [growthLog, setGrowthLog] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [activeTab, setActiveTab] = useState('metrics');
  const [themeOpen, setThemeOpen] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [metricsRes, growthRes, kbRes] = await Promise.all([
        API.get('/api/metrics'),
        API.get('/api/growth'),
        API.get('/api/knowledge'),
      ]);
      setMetrics(metricsRes.data);
      setGrowthLog(growthRes.data);
      setKnowledge(kbRes.data);
    } catch (e) { /* ignore */ }
  };

  const handlePersonaChange = async (p) => {
    setPersona(p);
    try { await API.put('/api/preferences/persona', { persona: p }); } catch (e) { /* ignore */ }
  };

  const themeIcons = { midnight: Moon, serenity: Sun, cyberpunk: Zap, aurora: Sparkles };

  return (
    <div data-testid="sidebar" style={{
      height: '100%', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column',
      background: 'var(--glass)', backdropFilter: 'blur(32px)',
      borderRight: '1px solid var(--glass-border)',
      position: 'relative', zIndex: 50,
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 300, color: 'var(--fg)', display: 'flex', alignItems: 'baseline', gap: 2 }}>
              ELARA<span style={{ color: 'var(--primary)', fontWeight: 600 }}>.AI</span>
            </h2>
            <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', marginTop: 4 }}>
              GPT-5.2 <span style={{ color: 'var(--primary)' }}>ONLINE</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button data-testid="close-sidebar" onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <X size={16} />
            </button>
            <style>{`
              @media (max-width: 1023px) {
                [data-testid="close-sidebar"] { display: flex !important; }
              }
            `}</style>
          </div>
        </div>

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={16} color="var(--bg)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'User'}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Theme selector */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button data-testid="theme-toggle" onClick={() => setThemeOpen(!themeOpen)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--fg)', cursor: 'pointer', fontSize: 12, fontFamily: 'JetBrains Mono',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Palette size={14} style={{ color: 'var(--primary)' }} />
            <span>{themes.find(t => t.id === theme)?.label || 'Theme'}</span>
          </div>
          <ChevronDown size={14} style={{ transform: themeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        {themeOpen && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {themes.map(t => {
              const Icon = themeIcons[t.id] || Moon;
              return (
                <button data-testid={`theme-${t.id}`} key={t.id} onClick={() => { setTheme(t.id); setThemeOpen(false); }} style={{
                  padding: '8px 10px', borderRadius: 8,
                  background: theme === t.id ? 'var(--primary)' : 'var(--surface)',
                  color: theme === t.id ? 'var(--bg)' : 'var(--fg)',
                  border: theme === t.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                  fontSize: 11, fontFamily: 'JetBrains Mono', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
                }}>
                  <Icon size={12} /> {t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Persona selector */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>Persona</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PERSONAS.map(p => (
            <button data-testid={`persona-${p.toLowerCase()}`} key={p} onClick={() => handlePersonaChange(p)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono',
              background: persona === p ? 'var(--primary)' : 'var(--surface)',
              color: persona === p ? 'var(--bg)' : 'var(--text-muted)',
              border: persona === p ? '1px solid var(--primary)' : '1px solid var(--border)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { id: 'metrics', label: 'Metrics', icon: Activity },
          { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
        ].map(tab => (
          <button data-testid={`tab-${tab.id}`} key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 11, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
            background: 'transparent', border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.2s',
          }}>
            <tab.icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {activeTab === 'metrics' && (
          <div>
            <MetricsRadar metrics={metrics} />
            {/* Growth log */}
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>System Logs</p>
              {growthLog.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Awaiting events...</p>
              ) : (
                growthLog.slice(0, 10).map((entry, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', marginBottom: 6, borderRadius: 6,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${entry.type === 'learning' ? '#3b82f6' : entry.type === 'proposal' ? '#f59e0b' : 'var(--primary)'}`,
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg)' }}>{entry.title}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{entry.details?.substring(0, 80)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div>
            <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Knowledge Base ({knowledge.length} entries)</p>
            {knowledge.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No knowledge entries yet. Chat with Elara to build your knowledge base.</p>
            ) : (
              knowledge.map((entry, i) => (
                <div key={i} style={{
                  padding: '8px 12px', marginBottom: 6, borderRadius: 6,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  <p style={{ fontSize: 12, color: 'var(--fg)' }}>{entry.content?.substring(0, 120)}</p>
                  <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button data-testid="logout-btn" onClick={logout} style={{
          width: '100%', padding: '10px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
          color: '#ef4444', fontSize: 12, fontFamily: 'JetBrains Mono',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: 'pointer', transition: 'all 0.2s',
        }}>
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </div>
  );
}
