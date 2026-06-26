import { useState } from 'react';
import { apiFetch } from '../utils/api';

const DeleteRequestModal = ({ entityType, entityId, entityName, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/delete-requests', {
        method: 'POST',
        body: JSON.stringify({ entityType, entityId, reason })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit request');
      }
      onSuccess();
      onClose();
    } catch (e) { setErr(e.message); }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Request Deletion</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            You are requesting to delete:
          </p>
          <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {entityName} (#{entityId})
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>Reason for deletion <span className="required">*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              rows={4}
              placeholder="Why does this record need to be deleted?"
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem'
              }}
            />
          </div>
          {err && <div className="toast toast-error" style={{ marginBottom: '1rem', padding: '0.5rem', fontSize: '0.8rem' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-danger" disabled={submitting} style={{ flex: 1 }}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteRequestModal;
