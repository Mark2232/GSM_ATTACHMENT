import React, { useState, useEffect } from 'react';

export default function ConfigTab({ onSaveConfig }) {
  const [config, setConfig] = useState({
    gatewayIp: '192.168.8.190',
    username: 'admin',
    password: 'admin',
    line: 1,
    useMockGateway: false,
    minDelaySec: 1,
    maxDelaySec: 2,
    enableJitter: false,
    maxDailyLimit: 200,
    carrierName: 'Globe Telecom (PH)',
    simNumber: '09368504167'
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data) setConfig(prev => ({ ...prev, ...data }));
      })
      .catch(e => console.error(e));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const result = await onSaveConfig(config);
      if (result?.success) {
        setMsg('Configuration saved successfully!');
      } else {
        setMsg('Failed to save settings');
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', background: '#ffffff', padding: '28px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
        Gateway Hardware & Engine Configuration
      </h2>
      <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 20px 0' }}>
        Manage connection parameters and queue timing for your physical DBL GoIP-1 device
      </p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '0.85rem', marginBottom: '16px', fontWeight: 700 }}>
          {msg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* GoIP Hardware Network */}
        <div style={{ padding: '16px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px 0', color: '#0f172a' }}>
            GoIP-1 Hardware Network
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Gateway LAN IP Address
              </label>
              <input
                type="text"
                className="input-field"
                value={config.gatewayIp}
                onChange={e => setConfig({ ...config, gatewayIp: e.target.value })}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                SIM Card Phone Number
              </label>
              <input
                type="text"
                className="input-field"
                value={config.simNumber}
                onChange={e => setConfig({ ...config, simNumber: e.target.value })}
                placeholder="09368504167"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Web GUI Username
              </label>
              <input
                type="text"
                className="input-field"
                value={config.username}
                onChange={e => setConfig({ ...config, username: e.target.value })}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Web GUI Password
              </label>
              <input
                type="password"
                className="input-field"
                value={config.password}
                onChange={e => setConfig({ ...config, password: e.target.value })}
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Queue Timing */}
        <div style={{ padding: '16px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px 0', color: '#0f172a' }}>
            Queue & Safety Settings
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Min Delay Between Messages (Sec)
              </label>
              <input
                type="number"
                className="input-field"
                value={config.minDelaySec}
                onChange={e => setConfig({ ...config, minDelaySec: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Max Daily SMS Safety Limit
              </label>
              <input
                type="number"
                className="input-field"
                value={config.maxDailyLimit}
                onChange={e => setConfig({ ...config, maxDailyLimit: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={saving}
          style={{ padding: '12px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
