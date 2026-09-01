import React, { useState, useEffect } from 'react';

export default function UssdTab({ onRunUssd }) {
  const [command, setCommand] = useState('*143#');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);

  const presets = [
    { label: 'Globe Promo Menu', code: '*143#' },
    { label: 'Check Balance & Load', code: '*143*1#' },
    { label: 'Smart / TNT Balance', code: '*123#' },
    { label: 'DITO Menu', code: '*185#' }
  ];

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/ussd/logs').then(r => r.json());
      setHistory(res);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleSend = async (codeToSend) => {
    const code = codeToSend || command;
    if (!code) return;

    setLoading(true);
    setLastResponse(null);
    try {
      const result = await onRunUssd(code);
      setLastResponse(result);
      loadHistory();
    } catch (e) {
      setLastResponse({ success: false, raw: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
      
      {/* 1. USSD Sender Panel */}
      <div style={{ gridColumn: 'span 6', background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
          Interactive USSD Terminal
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 16px 0' }}>
          Query prepaid SIM balance and promos on GoIP-1 Line 1
        </p>

        {/* Quick Presets */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
            Quick Network Presets
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {presets.map(p => (
              <button
                key={p.code}
                type="button"
                onClick={() => { setCommand(p.code); handleSend(p.code); }}
                style={{
                  padding: '8px 10px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                <strong style={{ display: 'block', color: '#0f172a' }}>{p.label}</strong>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>{p.code}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom USSD Input */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
              USSD Command or Menu Selection
            </label>
            <input
              type="text"
              className="input-field"
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="e.g. *143# or 1"
              required
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700 }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !command}
            style={{ padding: '11px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {loading ? 'Sending to GoIP Line...' : 'Transmit USSD Command'}
          </button>
        </form>

        {/* Response Box */}
        {lastResponse && (
          <div style={{
            marginTop: '16px',
            padding: '14px',
            borderRadius: '6px',
            background: lastResponse.success ? '#f8fafc' : '#fef2f2',
            border: `1px solid ${lastResponse.success ? '#cbd5e1' : '#fecaca'}`
          }}>
            <strong style={{ fontSize: '0.85rem', color: lastResponse.success ? '#059669' : '#dc2626', display: 'block', marginBottom: '6px' }}>
              {lastResponse.success ? 'USSD Response Received:' : 'USSD Request Failed:'}
            </strong>
            <pre style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#0f172a'
            }}>
              {lastResponse.reply || lastResponse.raw || JSON.stringify(lastResponse, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* 2. USSD History Panel */}
      <div style={{ gridColumn: 'span 6', background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px 0', color: '#0f172a' }}>
          USSD Transaction Logs ({history.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto' }}>
          {history.map(h => (
            <div key={h.id} style={{ padding: '12px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>{h.command}</strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{new Date(h.timestamp).toLocaleTimeString()}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {h.reply}
              </p>
            </div>
          ))}

          {history.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.82rem' }}>
              No USSD queries executed yet.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
