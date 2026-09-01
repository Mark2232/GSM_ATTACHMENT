import React, { useState, useEffect } from 'react';

// Helper to calculate GSM SMS Parts & Unicode detection
function analyzeSmsContent(text) {
  if (!text) return { length: 0, isUnicode: false, limit: 160, parts: 1 };

  const gsm7Regex = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§àäöñüà]*$/;
  const isUnicode = !gsm7Regex.test(text);

  const len = text.length;
  let limit = isUnicode ? 70 : 160;
  let partLimit = isUnicode ? 67 : 153;

  let parts = 1;
  if (len > limit) {
    parts = Math.ceil(len / partLimit);
  }

  return {
    length: len,
    isUnicode,
    limit,
    partLimit,
    parts
  };
}

export default function DispatchTab({ onSendSingle, onSendSms, onSendBulk, contacts = [] }) {
  const sendFn = onSendSingle || onSendSms;
  
  // Single Recipient Form
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('+639171234567');
  const [message, setMessage] = useState('Hello {{name}}! This is an automated update from our service.');

  // Bulk List Form
  const [bulkInput, setBulkInput] = useState('Juan Gomez, 09171234567\nMaria Santos, 09189876543\nAlex Reyes, 09201112233');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [bulkModeType, setBulkModeType] = useState('directory'); // 'directory' | 'manual'

  const [mode, setMode] = useState('single'); // 'single' | 'bulk'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);

  // Initialize selectedContactIds with all contact IDs
  useEffect(() => {
    if (contacts.length > 0 && selectedContactIds.length === 0) {
      setSelectedContactIds(contacts.map(c => c.id));
    }
  }, [contacts]);

  const smsAnalysis = analyzeSmsContent(message);

  const handleSelectContactForSingle = (e) => {
    const cid = e.target.value;
    if (cid === 'custom') {
      setRecipientName('');
      setRecipientPhone('');
    } else {
      const found = contacts.find(c => c.id === cid);
      if (found) {
        setRecipientName(found.name);
        setRecipientPhone(found.phone);
      }
    }
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    if (!recipientPhone || !message) return;

    setIsSubmitting(true);
    // Replace {{name}} in single message if name is provided
    const finalMsg = recipientName 
      ? message.replace(/\{\{\s*name\s*\}\}/gi, recipientName)
      : message.replace(/\{\{\s*name\s*\}\}/gi, 'Valued Client');

    const res = await sendFn(recipientPhone, finalMsg);
    setIsSubmitting(false);

    if (res?.success) {
      setLastNotification({
        type: 'success',
        text: `Direct message queued to ${recipientName || recipientPhone} (ID: ${res.data?.id})`
      });
    } else {
      setLastNotification({
        type: 'error',
        text: res?.error || 'Failed to queue direct message'
      });
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    let recipientsList = [];

    if (bulkModeType === 'directory') {
      // Pick selected registered contacts with Name & Phone
      recipientsList = contacts
        .filter(c => selectedContactIds.includes(c.id))
        .map(c => ({ name: c.name, phone: c.phone }));
    } else {
      // Parse manual lines in format: "Name, Phone" or "Phone"
      recipientsList = bulkInput
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 5)
        .map(line => {
          if (line.includes(',')) {
            const parts = line.split(',');
            return {
              name: parts[0].trim(),
              phone: parts.slice(1).join(',').trim()
            };
          }
          return { name: 'Valued Client', phone: line };
        });
    }

    if (recipientsList.length === 0 || !message) {
      setLastNotification({
        type: 'error',
        text: 'Please select or enter at least one recipient with a phone number.'
      });
      return;
    }

    setIsSubmitting(true);
    const res = await onSendBulk(recipientsList, message);
    setIsSubmitting(false);

    if (res?.success) {
      setLastNotification({
        type: 'success',
        text: `Queued personalized direct messages to ${res.count} recipients!`
      });
    } else {
      setLastNotification({
        type: 'error',
        text: res?.error || 'Bulk dispatch failed'
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(contacts.map(c => c.id));
    }
  };

  const toggleContact = (id) => {
    if (selectedContactIds.includes(id)) {
      setSelectedContactIds(selectedContactIds.filter(cid => cid !== id));
    } else {
      setSelectedContactIds([...selectedContactIds, id]);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', background: '#ffffff', padding: '28px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      
      {/* Header & Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
            Direct Message Composer
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            Send direct and personalized client messages via GoIP-1 SIM Line 1
          </p>
        </div>

        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '6px' }}>
          <button
            onClick={() => setMode('single')}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: 'none',
              background: mode === 'single' ? '#2563eb' : 'transparent',
              color: mode === 'single' ? '#ffffff' : '#475569',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Single Recipient
          </button>
          <button
            onClick={() => setMode('bulk')}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: 'none',
              background: mode === 'bulk' ? '#2563eb' : 'transparent',
              color: mode === 'bulk' ? '#ffffff' : '#475569',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Bulk List ({mode === 'bulk' && bulkModeType === 'directory' ? selectedContactIds.length : 'Multiple'})
          </button>
        </div>
      </div>

      {/* Notifications */}
      {lastNotification && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '6px',
          marginBottom: '16px',
          fontSize: '0.82rem',
          fontWeight: 600,
          background: lastNotification.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${lastNotification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: lastNotification.type === 'success' ? '#065f46' : '#991b1b'
        }}>
          {lastNotification.text}
        </div>
      )}

      {/* 1. SINGLE RECIPIENT */}
      {mode === 'single' && (
        <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Quick Pick from Directory */}
          {contacts.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Choose from Client Directory (Optional)
              </label>
              <select
                className="input-field"
                onChange={handleSelectContactForSingle}
                defaultValue="custom"
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                <option value="custom">-- Pick a client or enter manually below --</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone} ({c.group || 'Client'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                Client Name (Optional)
              </label>
              <input
                type="text"
                className="input-field"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                placeholder="e.g. Juan Gomez"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                Phone Number *
              </label>
              <input
                type="text"
                className="input-field"
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
                placeholder="0917xxxxxxx"
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                Message Body
              </label>
              <button
                type="button"
                onClick={() => setMessage(prev => prev + ' {{name}}')}
                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
              >
                + Insert &#123;&#123;name&#125;&#125;
              </button>
            </div>

            <textarea
              className="input-field"
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message here..."
              required
              style={{ width: '100%', resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '0.75rem', color: '#64748b' }}>
              <span>Characters: <strong>{smsAnalysis.length}</strong></span>
              <span>•</span>
              <span>Encoding: <strong style={{ color: smsAnalysis.isUnicode ? '#d97706' : '#2563eb' }}>{smsAnalysis.isUnicode ? 'Unicode (UCS-2)' : 'GSM 7-Bit'}</strong></span>
              <span>•</span>
              <span>Segments: <strong style={{ color: '#059669' }}>{smsAnalysis.parts} SMS</strong></span>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || !recipientPhone || !message}
            style={{ padding: '11px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {isSubmitting ? 'Queuing Message...' : 'Send Direct Message'}
          </button>
        </form>
      )}

      {/* 2. BULK LIST WITH NAMES */}
      {mode === 'bulk' && (
        <form onSubmit={handleBulkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Bulk Method Switcher */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
            <button
              type="button"
              onClick={() => setBulkModeType('directory')}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: bulkModeType === 'directory' ? '#eff6ff' : '#ffffff',
                color: bulkModeType === 'directory' ? '#2563eb' : '#475569',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Select from Registered Clients ({contacts.length})
            </button>

            <button
              type="button"
              onClick={() => setBulkModeType('manual')}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: bulkModeType === 'manual' ? '#eff6ff' : '#ffffff',
                color: bulkModeType === 'manual' ? '#2563eb' : '#475569',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Type Name & Number List
            </button>
          </div>

          {/* A. Directory Checkboxes */}
          {bulkModeType === 'directory' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                  Select Clients to Receive Message ({selectedContactIds.length} selected)
                </label>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {selectedContactIds.length === contacts.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {contacts.map(c => {
                  const isChecked = selectedContactIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        background: isChecked ? '#ffffff' : 'transparent',
                        border: isChecked ? '1px solid #bfdbfe' : '1px solid transparent',
                        cursor: 'pointer',
                        fontSize: '0.82rem'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleContact(c.id)}
                        style={{ accentColor: '#2563eb' }}
                      />
                      <strong style={{ color: '#0f172a' }}>{c.name}</strong>
                      <span style={{ color: '#2563eb' }}>({c.phone})</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#64748b' }}>{c.group || 'Client'}</span>
                    </label>
                  );
                })}

                {contacts.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '0.8rem' }}>
                    No registered clients found. You can switch to "Type Name & Number List" tab above.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* B. Manual List with Name & Phone */}
          {bulkModeType === 'manual' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                Client Names and Numbers (Format: <code>Name, Phone</code> — one per line)
              </label>
              <textarea
                className="input-field"
                rows={5}
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                placeholder="Juan Gomez, 09171234567&#10;Maria Santos, 09189876543&#10;Alex Reyes, 09201112233"
                required
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>
          )}

          {/* Message Body with {{name}} */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                Message Text (Supports <code>&#123;&#123;name&#125;&#125;</code>)
              </label>
              <button
                type="button"
                onClick={() => setMessage(prev => prev + ' {{name}}')}
                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
              >
                + Insert &#123;&#123;name&#125;&#125;
              </button>
            </div>

            <textarea
              className="input-field"
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Hello {{name}}, this is a notice from our business..."
              required
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || !message}
            style={{ padding: '11px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {isSubmitting ? 'Queuing Messages...' : 'Send Bulk Direct Messages'}
          </button>
        </form>
      )}

    </div>
  );
}
