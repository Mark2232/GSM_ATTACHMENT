import React, { useState, useEffect } from 'react';

export default function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Appointment');
  const [content, setContent] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const categories = ['Appointment', 'Payment / Invoice', 'Promo / Discount', 'Follow-up', 'Emergency / Notice'];

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/templates').then(r => r.json());
      setTemplates(res);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title || !content) return;

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          content
        })
      }).then(r => r.json());

      if (res.success) {
        setTitle('');
        setContent('');
        loadTemplates();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      loadTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  const insertVariable = (variable) => {
    setContent(prev => prev + ' ' + variable);
  };

  const copyTemplate = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
      
      {/* 1. Create Template Form */}
      <div style={{ gridColumn: 'span 5', background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
          Create SMS Template
        </h2>
        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 16px 0' }}>
          Templates with dynamic placeholders for quick client dispatch
        </p>

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
              Template Title *
            </label>
            <input
              type="text"
              className="input-field"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Appointment Confirmation"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
              Category
            </label>
            <select
              className="input-field"
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ width: '100%' }}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              Insert Dynamic Variable
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
              {['{{name}}', '{{date}}', '{{time}}', '{{notes}}'].map(v => (
                <button
                  type="button"
                  key={v}
                  onClick={() => insertVariable(v)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '0.75rem',
                    color: '#2563eb',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>
              Template Message Body *
            </label>
            <textarea
              className="input-field"
              rows={4}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Hello {{name}}! Your appointment is on {{date}} at {{time}}."
              required
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '10px', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Save Template
          </button>
        </form>
      </div>

      {/* 2. Templates Gallery */}
      <div style={{ gridColumn: 'span 7', background: '#ffffff', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
          Saved Templates ({templates.length})
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
          {templates.map(t => (
            <div key={t.id} style={{ padding: '14px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{t.title}</strong>
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                    {t.category}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => copyTemplate(t.content, t.id)}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {copiedId === t.id ? 'Copied!' : 'Copy Text'}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#334155', margin: 0, lineHeight: 1.4, background: '#ffffff', padding: '8px 10px', borderRadius: '4px', border: '1px solid #f1f5f9' }}>
                {t.content}
              </p>
            </div>
          ))}

          {templates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.82rem' }}>
              No templates saved yet.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
