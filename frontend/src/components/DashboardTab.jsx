import React, { useState } from 'react';

export default function DashboardTab({ 
  hwStatus, 
  queueInfo, 
  stats, 
  onNavigate, 
  onTriggerTest
}) {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryMsg, setDiscoveryMsg] = useState(null);
  const [testPhone, setTestPhone] = useState('09173079499');
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);

  const handleScan = async () => {
    setIsDiscovering(true);
    setDiscoveryMsg('Scanning local network for GoIP-1...');
    try {
      const res = await fetch('/api/hardware/discover', { method: 'POST' }).then(r => r.json());
      if (res.success) {
        setDiscoveryMsg(`Connected to GoIP at ${res.ip}`);
      } else {
        setDiscoveryMsg(res.message || 'No GoIP detected');
      }
    } catch (e) {
      setDiscoveryMsg(`Scan error: ${e.message}`);
    }
    setIsDiscovering(false);
    setTimeout(() => setDiscoveryMsg(null), 5000);
  };

  const handleQuickTest = async (e) => {
    e.preventDefault();
    if (!testPhone) return;
    setTestSending(true);
    setTestFeedback(null);
    try {
      const res = await onTriggerTest(testPhone, `Jarvis GoIP-1 GSM Test SMS at ${new Date().toLocaleTimeString()}`);
      if (res.success) {
        setTestFeedback({ type: 'success', text: 'Test SMS successfully queued for transmission!' });
      } else {
        setTestFeedback({ type: 'error', text: res.error || 'Failed to queue test SMS' });
      }
    } catch (err) {
      setTestFeedback({ type: 'error', text: err.message });
    }
    setTestSending(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '18px' }}>
      
      {/* Welcome & Overview Banner */}
      <div style={{ gridColumn: 'span 12', background: '#ffffff', padding: '20px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#ecfdf5', color: '#059669', fontWeight: 800 }}>
              GSM GATEWAY READY
            </span>
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
            GoIP-1 GSM Cellular Engine
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
            Automated SMS transmission engine with anti-SIM block jitter, queue management, and GoIP-1 hardware control.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate('dispatch')}
            style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Direct Message
          </button>
          <button
            onClick={() => onNavigate('contacts')}
            style={{ padding: '8px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Contacts Directory
          </button>
        </div>
      </div>

      {/* METRICS ROW */}
      <div style={{ gridColumn: 'span 3', background: '#ffffff', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
          Gateway Status
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: hwStatus?.status === 'ONLINE' ? '#059669' : '#dc2626' }}>
          {hwStatus?.status || 'ONLINE'}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px', fontWeight: 700 }}>
          GoIP-1 Line 1 Active
        </div>
      </div>

      <div style={{ gridColumn: 'span 3', background: '#ffffff', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
          Total Messages Sent
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
          {stats?.sentCount || 0}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '4px', fontWeight: 700 }}>
          Delivered via Hardware
        </div>
      </div>

      <div style={{ gridColumn: 'span 3', background: '#ffffff', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
          Queue Backlog
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: queueInfo?.queue?.length > 0 ? '#d97706' : '#0f172a' }}>
          {queueInfo?.queue?.length || 0}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#7c3aed', marginTop: '4px', fontWeight: 700 }}>
          {queueInfo?.isProcessing ? 'Processing Active' : 'Idle'}
        </div>
      </div>

      <div style={{ gridColumn: 'span 3', background: '#ffffff', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
          SIM Card Number
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb' }}>
          {hwStatus?.simNumber || '09173079499'}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '4px', fontWeight: 700 }}>
          Globe Postpaid Cellular
        </div>
      </div>

      {/* GoIP Hardware Telemetry Card */}
      <div style={{ gridColumn: 'span 7', background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            GoIP-1 Hardware Telemetry
          </h3>
          <span style={{
            fontSize: '0.72rem',
            padding: '2px 8px',
            borderRadius: '4px',
            background: hwStatus?.status === 'ONLINE' ? '#ecfdf5' : '#fef2f2',
            color: hwStatus?.status === 'ONLINE' ? '#059669' : '#dc2626',
            fontWeight: 800
          }}>
            {hwStatus?.status || 'ONLINE'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '2px' }}>Attached SIM Card</span>
            <strong style={{ fontSize: '1rem', color: hwStatus?.simState === 'EMPTY' ? '#dc2626' : '#2563eb' }}>
              {hwStatus?.simState === 'EMPTY' ? 'EMPTY' : (hwStatus?.simNumber || '09173079499')}
            </strong>
            <span style={{ fontSize: '0.75rem', color: hwStatus?.simState === 'EMPTY' ? '#dc2626' : '#64748b', display: 'block' }}>
              {hwStatus?.simState === 'EMPTY' ? 'No SIM Card' : 'Line 1 (Active)'}
            </span>
          </div>

          <div style={{ padding: '12px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '2px' }}>Network & Carrier</span>
            <strong style={{ fontSize: '1rem', color: '#059669' }}>{hwStatus?.carrier || 'Globe Postpaid'}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Signal: {hwStatus?.signalBars || 5}/5 Bars</span>
          </div>

          <div style={{ padding: '12px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '2px' }}>Gateway IP</span>
            <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{hwStatus?.lanIp || '192.168.8.190'}</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Latency: {hwStatus?.latencyMs || 25} ms</span>
          </div>

          <div style={{ padding: '12px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '2px' }}>Hardware Model</span>
            <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>DBL GoIP-1 Gateway</strong>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>FW: {hwStatus?.firmwareVersion || 'GHSFVT-1.1-68-9'}</span>
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
          <button
            onClick={handleScan}
            disabled={isDiscovering}
            style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            {isDiscovering ? 'Scanning...' : 'Auto-Detect GoIP IP'}
          </button>
        </div>
        {discoveryMsg && <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#2563eb' }}>{discoveryMsg}</div>}
      </div>

      {/* Quick Test SMS Dispatch */}
      <div style={{ gridColumn: 'span 5', background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 10px 0', color: '#0f172a' }}>
          Instant Test SMS
        </h3>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '12px' }}>
          Dispatch an instant ping SMS to verify hardware antenna and cellular tower transmission.
        </p>

        <form onSubmit={handleQuickTest} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Recipient Mobile Number:
            </label>
            <input
              type="text"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="e.g. 09173079499"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={testSending}
            style={{
              padding: '8px 16px',
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            {testSending ? 'Queuing...' : '⚡ Send Test SMS'}
          </button>

          {testFeedback && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: testFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: testFeedback.type === 'success' ? '#059669' : '#dc2626',
              border: `1px solid ${testFeedback.type === 'success' ? '#a7f3d0' : '#fecaca'}`
            }}>
              {testFeedback.text}
            </div>
          )}
        </form>
      </div>

    </div>
  );
}
