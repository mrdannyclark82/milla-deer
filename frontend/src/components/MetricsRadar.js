import React from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';

export default function MetricsRadar({ metrics }) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        No metrics data yet. Chat with Elara to generate metrics.
      </div>
    );
  }

  const data = Object.entries(metrics).map(([key, value]) => ({
    subject: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
    value: typeof value === 'number' ? value : 50,
    fullMark: 100,
  }));

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#F7E7CE';

  return (
    <div data-testid="metrics-radar">
      <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>Neural Metrics</p>
      <div style={{ width: '100%', height: 220, marginLeft: -16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Score" dataKey="value" stroke={primaryColor} strokeWidth={1.5} fill={primaryColor} fillOpacity={0.15} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 11, color: 'var(--fg)', fontFamily: 'JetBrains Mono',
              }}
              itemStyle={{ color: 'var(--primary)' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Metric bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
        {data.slice(0, 6).map((d, i) => (
          <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{d.subject}</span>
              <span style={{ fontSize: 9, color: 'var(--primary)', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{d.value}</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--bg)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${d.value}%`, background: 'var(--primary)', borderRadius: 2, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
