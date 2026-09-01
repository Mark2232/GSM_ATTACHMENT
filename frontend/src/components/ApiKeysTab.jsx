import React, { useState, useEffect } from 'react';
import { Key, Copy, Check, Code2, Terminal, Plus, Trash2, Globe, Shield } from 'lucide-react';

export default function ApiKeysTab() {
  const [keys, setKeys] = useState([]);
  const [keyName, setKeyName] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [selectedLang, setSelectedLang] = useState('curl');

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/keys').then(r => r.json());
      setKeys(res);
    } catch (e) {}
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!keyName) return;
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName })
      }).then(r => r.json());
      if (res.success) {
        setKeyName('');
        loadKeys();
      }
    } catch (e) {}
  };

  const handleDelete = async (id) => {
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    loadKeys();
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const activeApiKey = keys[0]?.key || 'tb_live_goip_admin_master';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3080';

  const snippets = {
    curl: `curl -X POST ${baseUrl}/api/v1/gateway/send \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${activeApiKey}" \\
  -d '{
    "recipients": ["+639173079499"],
    "message": "Hello! Your verification code is 849201."
  }'`,
    nodejs: `const axios = require('axios');

async function sendSMS() {
  const response = await axios.post('${baseUrl}/api/v1/gateway/send', {
    recipients: ['+639173079499'],
    message: 'Hello! Your verification code is 849201.'
  }, {
    headers: { 'x-api-key': '${activeApiKey}' }
  });
  console.log('GoIP-1 Dispatch:', response.data);
}
sendSMS();`,
    python: `import requests

url = "${baseUrl}/api/v1/gateway/send"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "${activeApiKey}"
}
payload = {
    "recipients": ["+639173079499"],
    "message": "Hello! Your verification code is 849201."
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
      
      {/* 1. API Keys Management */}
      <div style={{ gridColumn: 'span 6', padding: '24px' }} className="glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Key size={22} color="#2563eb" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>Jarvis Developer API Keys</h2>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Authenticate external webhooks, apps, websites, CRMs, or backend scripts directly to your physical GoIP-1 hardware.
        </p>

        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="Key Description (e.g. My Website / CRM)" 
            className="input-field" 
            value={keyName} 
            onChange={e => setKeyName(e.target.value)} 
            required 
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0 16px' }}>
            <Plus size={16} /> Generate Key
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {keys.map(k => (
            <div key={k.id} style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{k.name}</strong>
                <button onClick={() => handleDelete(k.id)} className="btn btn-danger" style={{ padding: '4px 8px' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#0284c7' }}>{k.key}</code>
                <button 
                  onClick={() => copyToClipboard(k.key, k.id)} 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  {copiedId === k.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  {copiedId === k.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Developer Integration Code Snippets */}
      <div style={{ gridColumn: 'span 6', padding: '24px' }} className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Code2 size={22} color="#059669" />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>Quickstart Code Snippets</h2>
          </div>

          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
            {['curl', 'nodejs', 'python'].map(lang => (
              <button
                key={lang}
                onClick={() => setSelectedLang(lang)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedLang === lang ? '#ffffff' : 'transparent',
                  color: selectedLang === lang ? '#2563eb' : 'var(--text-muted)'
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <pre style={{
            background: '#0f172a',
            color: '#f8fafc',
            padding: '16px',
            borderRadius: '10px',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
            overflowX: 'auto',
            lineHeight: 1.5
          }}>
            {snippets[selectedLang]}
          </pre>
          <button
            onClick={() => copyToClipboard(snippets[selectedLang], 'snippet')}
            className="btn btn-secondary"
            style={{ position: 'absolute', top: '10px', right: '10px', padding: '4px 8px', fontSize: '0.75rem' }}
          >
            {copiedId === 'snippet' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          </button>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1e40af' }}>
          💡 <strong>Endpoint:</strong> <code>POST {baseUrl}/api/v1/gateway/send</code><br/>
          Sends SMS directly through your physical GoIP-1 with automatic anti-SIM blocking delay jitter!
        </div>
      </div>

    </div>
  );
}
