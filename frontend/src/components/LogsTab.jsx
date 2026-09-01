import React, { useState, useEffect } from 'react';

export default function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('ALL');

  const loadLogs = async () => {
    try {
      const res = await fetch('/api/logs').then(r => r.json());
      setLogs(res);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter(l => filter === 'ALL' || l.level === filter);

  return (
    <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
            System & Dispatch Logs
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            Live event logs from GoIP-1 driver, message queue engine, and incoming client requests
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            className="input-field"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ width: '130px', fontSize: '0.82rem' }}
          >
            <option value="ALL">All Levels</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          <button
            onClick={loadLogs}
            style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Logs Window */}
      <div style={{
        background: '#0f172a',
        borderRadius: '6px',
        padding: '16px',
        maxHeight: '520px',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.82rem'
      }}>
        {filteredLogs.map(l => {
          let levelColor = '#94a3b8';
          if (l.level === 'success') levelColor = '#4ade80';
          if (l.level === 'error') levelColor = '#f87171';
          if (l.level === 'warning') levelColor = '#fbbf24';
          if (l.level === 'info') levelColor = '#60a5fa';

          return (
            <div key={l.id} style={{ display: 'flex', gap: '12px', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
              <span style={{ color: '#64748b' }}>{new Date(l.timestamp).toLocaleTimeString()}</span>
              <span style={{ color: levelColor, fontWeight: 700, width: '65px' }}>[{l.level.toUpperCase()}]</span>
              <span style={{ color: '#f1f5f9', flex: 1 }}>{l.message}</span>
            </div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
            No log entries found.
          </div>
        )}
      </div>

    </div>
  );
}
