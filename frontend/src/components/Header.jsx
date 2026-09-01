import React from 'react';

export default function Header({ isConnected, hwStatus, activeTab, setActiveTab }) {
  const allTabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'dispatch', label: 'Direct Message' },
    { id: 'queue', label: 'Queue & Messages' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'templates', label: 'Templates' },
    { id: 'appointments', label: 'Appointments' },
    { id: 'config', label: 'Hardware Settings' }
  ];

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: '14px 24px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        
        {/* Brand & System Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Jarvis SMS Gateway
              </span>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '4px',
                background: '#eff6ff',
                color: '#2563eb',
                fontWeight: 700,
                border: '1px solid #bfdbfe'
              }}>
                GoIP-1 Hardware Engine
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Universal GSM Gateway & Developer Integration System
            </p>
          </div>
        </div>

        {/* Telemetry & Hardware Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          {/* SIM & Network Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#f8fafc',
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.82rem'
          }}>
            <span>
              Gateway IP: <strong style={{ color: '#0f172a' }}>{hwStatus?.lanIp || '192.168.8.190'}</strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>
              SIM: <strong style={{ color: hwStatus?.simState === 'EMPTY' ? '#dc2626' : '#2563eb' }}>
                {hwStatus?.simState === 'EMPTY' ? 'EMPTY' : (hwStatus?.simNumber || '09173079499')}
              </strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{
              fontWeight: 800,
              color: isConnected ? '#059669' : '#dc2626'
            }}>
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

        </div>

      </div>

      {/* Navigation Tabs */}
      <div style={{
        maxWidth: '1400px',
        margin: '12px auto 0',
        display: 'flex',
        gap: '4px',
        overflowX: 'auto',
        borderTop: '1px solid #f1f5f9',
        paddingTop: '10px'
      }}>
        {allTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? '#2563eb' : 'transparent',
                color: isActive ? '#ffffff' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
