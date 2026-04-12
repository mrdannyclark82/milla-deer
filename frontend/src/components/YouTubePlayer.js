import React from 'react';
import { X, ExternalLink } from 'lucide-react';

export default function YouTubePlayer({ video, onClose }) {
  if (!video) return null;

  return (
    <div data-testid="youtube-player" style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 100,
      width: 360, borderRadius: 12, overflow: 'hidden',
      background: 'var(--surface)', border: '1px solid var(--border)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      animation: 'fadeInUp 0.3s ease-out',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'var(--glass)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontWeight: 500, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {video.title || 'YouTube Video'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <a
            data-testid="youtube-external-link"
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <ExternalLink size={14} />
          </a>
          <button
            data-testid="youtube-close"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Video embed */}
      <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
        <iframe
          data-testid="youtube-iframe"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
          title={video.title || 'YouTube video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Info bar */}
      {video.channel && (
        <div style={{
          padding: '6px 12px', background: 'var(--glass)',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
            {video.channel}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', letterSpacing: '0.15em' }}>
            PiP MODE
          </span>
        </div>
      )}
    </div>
  );
}
