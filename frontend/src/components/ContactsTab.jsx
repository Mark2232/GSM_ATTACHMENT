import React, { useState, useEffect } from 'react';

export default function ContactsTab({ onSendBulkSms, onRefresh }) {
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState(['VIP Clients', 'General', 'Leads', 'Staff']);
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // New Contact Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [group, setGroup] = useState('General');
  const [notes, setNotes] = useState('');

  // Bulk Message Modal
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState(null);

  const loadContacts = async () => {
    try {
      const res = await fetch('/api/contacts').then(r => r.json());
      setContacts(res);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!phone) return;

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, group, notes })
      });
      if (res.ok) {
        setName('');
        setPhone('');
        setNotes('');
        loadContacts();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteContact = async (id) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadContacts();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredContacts = contacts.filter(c => {
    const matchesGroup = selectedGroup === 'ALL' || c.group === selectedGroup;
    const matchesSearch = !searchQuery || 
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.phone?.includes(searchQuery);
    return matchesGroup && matchesSearch;
  });

  const handleBroadcastGroup = async (e) => {
    e.preventDefault();
    if (!bulkMessage.trim()) return;

    const targets = filteredContacts.map(c => ({ phone: c.phone, name: c.name }));
    if (targets.length === 0) {
      setBulkFeedback({ type: 'error', text: 'No contacts selected in this group filter.' });
      return;
    }

    setIsSendingBulk(true);
    setBulkFeedback(null);
    try {
      const res = await onSendBulkSms(targets, bulkMessage);
      if (res.success) {
        setBulkFeedback({ type: 'success', text: `Queued ${res.count || targets.length} SMS for GoIP-1 transmission!` });
        setBulkMessage('');
        setTimeout(() => {
          setIsBulkOpen(false);
          setBulkFeedback(null);
        }, 2000);
      } else {
        setBulkFeedback({ type: 'error', text: res.error || 'Failed to dispatch group SMS.' });
      }
    } catch (err) {
      setBulkFeedback({ type: 'error', text: err.message });
    }
    setIsSendingBulk(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
      
      {/* Left Column: Add New Contact Form */}
      <div style={{ gridColumn: 'span 4', background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 12px 0', color: '#0f172a' }}>
          Add New Contact
        </h3>
        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '16px' }}>
          Save mobile numbers into gateway address book for quick dispatch and group campaigns.
        </p>

        <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Full Name:
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Mobile Phone Number:
            </label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 09173079499 or +639173079499"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Group Category:
            </label>
            <select
              value={group}
              onChange={e => setGroup(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box', background: '#ffffff' }}
            >
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Notes (Optional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Preferred contact method"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: '6px',
              padding: '9px 16px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            + Save Contact
          </button>
        </form>
      </div>

      {/* Right Column: Contacts Table & Group Filter */}
      <div style={{ gridColumn: 'span 8', background: '#ffffff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        
        {/* Header & Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              Contact Address Book ({filteredContacts.length})
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Directory of phone numbers saved for SMS broadcasts
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsBulkOpen(true)}
              style={{
                padding: '7px 14px',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              📢 Broadcast to Group ({filteredContacts.length})
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Search name or phone..."
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem'
            }}
          />

          <div style={{ display: 'flex', gap: '4px' }}>
            {['ALL', ...groups].map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: selectedGroup === g ? '#2563eb' : '#f8fafc',
                  color: selectedGroup === g ? '#ffffff' : '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Contacts Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>Phone Number</th>
                <th style={{ padding: '8px 10px' }}>Group</th>
                <th style={{ padding: '8px 10px' }}>Notes</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px', fontWeight: 700, color: '#0f172a' }}>{c.name}</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>{c.phone}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>
                      {c.group || 'General'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: '#64748b', fontSize: '0.8rem' }}>{c.notes || '-'}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDeleteContact(c.id)}
                      style={{
                        background: '#fee2e2',
                        color: '#991b1b',
                        border: '1px solid #fca5a5',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    No contacts found. Add your first contact using the form on the left.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Broadcast Modal */}
      {isBulkOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '540px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
              Broadcast SMS to Selected Group
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '14px' }}>
              Sending to <strong>{filteredContacts.length} recipients</strong> in current filter (Group: {selectedGroup}). Use <code>&#123;&#123;name&#125;&#125;</code> for personalization.
            </p>

            <form onSubmit={handleBroadcastGroup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                value={bulkMessage}
                onChange={e => setBulkMessage(e.target.value)}
                placeholder="Hello {{name}}, we are pleased to inform you that..."
                rows="4"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
                required
              />

              {bulkFeedback && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: bulkFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  color: bulkFeedback.type === 'success' ? '#059669' : '#dc2626'
                }}>
                  {bulkFeedback.text}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setIsBulkOpen(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingBulk}
                  style={{
                    padding: '8px 16px',
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {isSendingBulk ? 'Queuing Broadcast...' : '⚡ Queue Broadcast SMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
