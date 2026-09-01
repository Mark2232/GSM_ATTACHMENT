import React, { useState, useEffect } from 'react';

export default function AppointmentsTab({ appointments = [], contacts = [], templates = [], onRefresh }) {
  const [selectedContactId, setSelectedContactId] = useState('');
  const [isCustomClient, setIsCustomClient] = useState(false);

  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '',
    serviceType: 'General Consultation & Service',
    date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0],
    time: '10:00 AM',
    notes: '',
    sendAutoReminder: true
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (contacts.length > 0 && !selectedContactId && !isCustomClient) {
      const first = contacts[0];
      setSelectedContactId(first.id);
      setForm(prev => ({
        ...prev,
        clientName: first.name,
        clientPhone: first.phone,
        notes: first.notes || ''
      }));
    }
  }, [contacts]);

  const handleContactChange = (e) => {
    const val = e.target.value;
    setSelectedContactId(val);

    if (val === 'custom') {
      setIsCustomClient(true);
      setForm(prev => ({
        ...prev,
        clientName: '',
        clientPhone: '',
        notes: ''
      }));
    } else {
      setIsCustomClient(false);
      const found = contacts.find(c => c.id === val);
      if (found) {
        setForm(prev => ({
          ...prev,
          clientName: found.name,
          clientPhone: found.phone,
          notes: found.notes || ''
        }));
      }
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.clientName || !form.clientPhone) return;

    setLoading(true);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (res.ok) {
        setSuccessMsg(`Appointment for ${form.clientName} (${form.clientPhone}) scheduled & SMS queued!`);
        if (onRefresh) onRefresh();
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this appointment record?')) return;
    try {
      await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
      
      {/* 1. Schedule Client Appointment Form */}
      <div style={{ gridColumn: 'span 6', background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ marginBottom: '18px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
            Schedule Client Appointment
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            Pick a client from your directory to auto-fill details and queue SMS confirmation
          </p>
        </div>

        {successMsg && (
          <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: '0.82rem', marginBottom: '14px', fontWeight: 700 }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Client Selector Dropdown */}
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
              <span>Choose Client from Directory</span>
              <span style={{ color: '#64748b', fontWeight: 500 }}>{contacts.length} clients</span>
            </label>

            <select
              className="input-field"
              value={selectedContactId}
              onChange={handleContactChange}
              style={{
                width: '100%',
                fontWeight: 600,
                color: '#1e293b',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                padding: '9px 12px',
                fontSize: '0.85rem'
              }}
            >
              {contacts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone} ({c.group || 'Client'})
                </option>
              ))}
              <option value="custom">+ Enter New Client Manually</option>
            </select>
          </div>

          {/* Auto-filled client summary tag */}
          {!isCustomClient && form.clientName && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.82rem'
            }}>
              <div>
                <strong style={{ color: '#1e40af' }}>{form.clientName}</strong>
                <span style={{ color: '#3b82f6', marginLeft: '6px' }}>({form.clientPhone})</span>
              </div>
              <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }}>
                Selected
              </span>
            </div>
          )}

          {/* Manual inputs if custom is chosen */}
          {isCustomClient && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                  Client Full Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={form.clientName}
                  onChange={e => setForm({ ...form, clientName: e.target.value })}
                  placeholder="e.g. Maria Santos"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                  Phone Number
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={form.clientPhone}
                  onChange={e => setForm({ ...form, clientPhone: e.target.value })}
                  placeholder="0917xxxxxxx"
                  required
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}

          {/* Service Type */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
              Service / Procedure Type
            </label>
            <input
              type="text"
              className="input-field"
              value={form.serviceType}
              onChange={e => setForm({ ...form, serviceType: e.target.value })}
              placeholder="e.g. Consultation / Service / Checkup"
              required
              style={{ width: '100%' }}
            />
          </div>

          {/* Date & Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Date
              </label>
              <input
                type="date"
                className="input-field"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
                Time
              </label>
              <input
                type="text"
                className="input-field"
                value={form.time}
                onChange={e => setForm({ ...form, time: e.target.value })}
                placeholder="10:00 AM"
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
              Notes & Location
            </label>
            <input
              type="text"
              className="input-field"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Room 2 / Bay 3"
              style={{ width: '100%' }}
            />
          </div>

          {/* SMS Notification Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <input
              type="checkbox"
              id="sendAuto"
              checked={form.sendAutoReminder}
              onChange={e => setForm({ ...form, sendAutoReminder: e.target.checked })}
              style={{ width: '15px', height: '15px', accentColor: '#2563eb' }}
            />
            <label htmlFor="sendAuto" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
              Automatically dispatch instant SMS booking confirmation to client
            </label>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !form.clientName}
            style={{
              padding: '11px',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {loading ? 'Scheduling...' : 'Schedule Appointment & Enqueue SMS'}
          </button>
        </form>
      </div>

      {/* 2. Scheduled Appointments List */}
      <div style={{ gridColumn: 'span 6', background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Active Appointments ({appointments.length})
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' }}>
          {appointments.map((apt) => (
            <div key={apt.id} style={{
              padding: '12px 14px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{apt.clientName}</strong>
                  <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                    {apt.clientPhone}
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#475569', display: 'block' }}>
                  {apt.serviceType} {apt.notes && `• ${apt.notes}`}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                  {apt.date} at {apt.time}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#ecfdf5', color: '#059669', fontWeight: 700 }}>
                  CONFIRMED
                </span>
                <button
                  onClick={() => handleDelete(apt.id)}
                  style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', cursor: 'pointer', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {appointments.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.82rem' }}>
              No appointments scheduled for this business yet.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
