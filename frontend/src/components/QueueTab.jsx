import React, { useState } from 'react';

export default function QueueTab({ queueInfo, stats, messages = [], onRefresh }) {
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'QUEUED' | 'SENT' | 'FAILED'
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const activeQueue = queueInfo?.queue || [];
  const isPaused = queueInfo?.isPaused || false;
  const isProcessing = queueInfo?.isProcessing || false;

  // Merge active in-flight items with historical messages
  const allItems = [
    ...activeQueue.map(q => ({ ...q, isLiveQueue: true })),
    ...messages.filter(m => !activeQueue.some(q => q.id === m.id))
  ];

  // Sort newest first
  allItems.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));

  const filteredItems = allItems.filter(item => {
    if (filter === 'ALL') return true;
    if (filter === 'QUEUED') return item.status === 'QUEUED' || item.status === 'SENDING' || item.status === 'RETRYING';
    if (filter === 'SENT') return item.status === 'SENT';
    if (filter === 'FAILED') return item.status === 'FAILED';
    return true;
  });

  const handlePause = async () => {
    setIsProcessingAction(true);
    try {
      await fetch('/api/queue/pause', { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (e) {}
    setIsProcessingAction(false);
  };

  const handleResume = async () => {
    setIsProcessingAction(true);
    try {
      await fetch('/api/queue/resume', { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (e) {}
    setIsProcessingAction(false);
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all pending items in the active queue?')) return;
    setIsProcessingAction(true);
    try {
      await fetch('/api/queue/clear', { method: 'DELETE' });
      if (onRefresh) onRefresh();
    } catch (e) {}
    setIsProcessingAction(false);
  };

  const handleCancelItem = async (id) => {
    try {
      await fetch(`/api/queue/item/${id}`, { method: 'DELETE' });
      if (onRefresh) onRefresh();
    } catch (e) {}
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
      
      {/* Control Header & Stats */}
      <div style={{ gridColumn: 'span 12', background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
            Message Logs
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            Live tracking of queued, sending, and dispatched client messages over your GoIP-1 GSM line
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isPaused ? (
            <button
              onClick={handleResume}
              disabled={isProcessingAction}
              style={{ padding: '7px 14px', background: '#059669', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Resume Queue
            </button>
          ) : (
            <button
              onClick={handlePause}
              disabled={isProcessingAction}
              style={{ padding: '7px 14px', background: '#f59e0b', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Pause Queue
            </button>
          )}

          <button
            onClick={handleClear}
            disabled={isProcessingAction || activeQueue.length === 0}
            style={{ padding: '7px 14px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '6px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
          >
            Clear Active Queue ({activeQueue.length})
          </button>
        </div>
      </div>

      {/* 1. Stat Summary Cards */}
      <div style={{ gridColumn: 'span 4', background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Pipeline Status</span>
        <strong style={{ fontSize: '1.4rem', color: isPaused ? '#f59e0b' : (isProcessing ? '#059669' : '#64748b') }}>
          {isPaused ? 'PAUSED' : (isProcessing ? 'SENDING NOW' : 'IDLE / READY')}
        </strong>
      </div>

      <div style={{ gridColumn: 'span 4', background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>In Active Queue</span>
        <strong style={{ fontSize: '1.4rem', color: '#2563eb' }}>
          {activeQueue.length} Pending
        </strong>
      </div>

      <div style={{ gridColumn: 'span 4', background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Successfully Sent</span>
        <strong style={{ fontSize: '1.4rem', color: '#059669' }}>
          {allItems.filter(m => m.status === 'SENT').length} Messages
        </strong>
      </div>

      {/* 2. Message Queue & History Table */}
      <div style={{ gridColumn: 'span 12', background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        
        {/* Table Filter Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Message History & Logs ({filteredItems.length})
          </h3>

          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
            {[
              { id: 'ALL', label: `All (${allItems.length})` },
              { id: 'QUEUED', label: `In Queue (${activeQueue.length})` },
              { id: 'SENT', label: `Sent (${allItems.filter(m => m.status === 'SENT').length})` },
              { id: 'FAILED', label: `Failed (${allItems.filter(m => m.status === 'FAILED').length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  background: filter === tab.id ? '#2563eb' : 'transparent',
                  color: filter === tab.id ? '#ffffff' : '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '10px 14px' }}>Time</th>
                <th style={{ padding: '10px 14px' }}>Recipient</th>
                <th style={{ padding: '10px 14px' }}>Message Body</th>
                <th style={{ padding: '10px 14px' }}>Attempts</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                let badgeBg = '#f1f5f9';
                let badgeColor = '#475569';

                if (item.status === 'SENT') {
                  badgeBg = '#ecfdf5';
                  badgeColor = '#059669';
                } else if (item.status === 'SENDING' || item.status === 'QUEUED') {
                  badgeBg = '#eff6ff';
                  badgeColor = '#2563eb';
                } else if (item.status === 'FAILED') {
                  badgeBg = '#fef2f2';
                  badgeColor = '#dc2626';
                } else if (item.status === 'RETRYING') {
                  badgeBg = '#fef3c7';
                  badgeColor = '#b45309';
                }

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {new Date(item.createdAt || item.updatedAt || item.timestamp || Date.now()).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {item.metadata?.recipientName && (
                        <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                          {item.metadata.recipientName}
                        </span>
                      )}
                      <span style={{ color: '#2563eb' }}>{item.recipient}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155', maxWidth: '380px' }}>
                      {item.message}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.8rem' }}>
                      {item.attempts || 1} / {item.maxAttempts || 3}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: badgeBg,
                        color: badgeColor,
                        fontWeight: 700
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {item.status === 'QUEUED' && (
                        <button
                          onClick={() => handleCancelItem(item.id)}
                          style={{
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {item.status === 'SENT' && (
                        <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                          Delivered
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>
                    No messages found in this queue view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
