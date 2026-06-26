import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    Users, Search, Filter, Download, Plus, Mail, Trash2, Edit, Key, 
    MoreHorizontal, CheckSquare, Square, X, Calendar, Phone, 
    ShieldCheck, ShieldAlert, ShieldOff, AlertTriangle, FileText, CheckCircle2, UserPlus, 
    ChevronRight, ArrowRight, DownloadCloud, Trash, Handshake, Award, CreditCard
} from 'lucide-react';
import { apiFetch, downloadBlob, viewBlob, getRole, getAdminId } from '../utils/api';

const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n)  => `KES ${Number(n || 0).toLocaleString('en-KE')}`;

  const ProfileModal = ({ memberId, onClose, onUpdate, showToast }) => {
  const [data, setData] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [updatingFlag, setUpdatingFlag] = useState(false);
  const fileRef = useRef(null);

  const role = (getRole() || 'admin').toLowerCase();
  const canManage = ['superadmin', 'admin', 'secretary', 'finance_admin', 'treasurer', 'ict_admin'].includes(role);
  const isICT = ['superadmin', 'ict_admin'].includes(role);

  const fetchProfile = () => {
    setLoading(true);
    const calls = [
      apiFetch(`/api/members/${memberId}/history`).then(r => r.json()),
      apiFetch(`/api/members/${memberId}/balance`).then(r => r.json()),
      apiFetch(`/api/members/${memberId}/documents`).then(r => r.json()),
    ];
    Promise.all(calls).then(([d, bal, docRes]) => {
      setData({ ...d, balance: bal });
      setDocs(docRes.documents || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { 
    fetchProfile(); 
  }, [memberId]);

  const handleFlagReset = async () => {
    setUpdatingFlag(true);
    try {
      const res = await apiFetch(`/api/members/${memberId}/flag-reset`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (showToast) showToast(d.message);
      fetchProfile();
      if (onUpdate) onUpdate();
    } catch (e) { if (showToast) showToast(e.message, 'error'); }
    finally { setUpdatingFlag(false); }
  };

  const handleUnflagReset = async () => {
    setUpdatingFlag(true);
    try {
      const res = await apiFetch(`/api/members/${memberId}/unflag-reset`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (showToast) showToast(d.message);
      fetchProfile();
      if (onUpdate) onUpdate();
    } catch (e) { if (showToast) showToast(e.message, 'error'); }
    finally { setUpdatingFlag(false); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const docType = document.getElementById(`docType-${memberId}`)?.value || 'Other';
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', docType);
    try {
      const res = await apiFetch(`/api/members/${memberId}/documents`, { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        setDocs([{ ...data, uploadDate: new Date().toISOString() }, ...docs]);
        fileRef.current.value = '';
      }
    } catch {}
    setUploading(false);
  };

  const handlePermanentDelete = async (docId) => {
    if (!window.confirm("Permanently delete this document from the server? This cannot be undone.")) return;
    try {
      const res = await apiFetch(`/api/members/${memberId}/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocs(docs.filter(d => d.id !== docId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete.');
      }
    } catch {
      alert('Network error.');
    }
  };

  const handleApprovePhone = async () => {
    if (!window.confirm(`Approve phone change to ${data.member.pending_phone}?`)) return;
    try {
        const res = await apiFetch(`/api/members/approve-phone/${memberId}`, { method: 'PUT' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        showToast(d.message);
        fetchProfile();
        if (onUpdate) onUpdate();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleRejectPhone = async () => {
    if (!window.confirm("Reject this phone change request?")) return;
    try {
        const res = await apiFetch(`/api/members/reject-phone/${memberId}`, { method: 'DELETE' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        showToast(d.message);
        fetchProfile();
        if (onUpdate) onUpdate();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <h3 style={{ margin:0 }}>{data?.member?.name || 'Member Profile'}</h3>
            {data?.member && (
              <>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: 4, background: data.member.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)', color: data.member.status === 'active' ? 'var(--success)' : 'var(--danger)', textTransform: 'uppercase' }}>
                  {data.member.status}
                </span>
                {data.member.must_change_password && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: 4, background: 'rgba(220,38,38,0.1)', color: 'var(--danger)', textTransform: 'uppercase' }}>
                    Reset Req.
                  </span>
                )}
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p className="td-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading profile…</p>
        ) : !data ? (
          <p className="td-muted" style={{ padding: '2rem', textAlign: 'center' }}>Failed to load.</p>
        ) : (
          <>
            {/* Stats cards */}
            <div className="profile-stats">
              <div className="profile-stat">
                <div className="label">Total Contributed</div>
                <div className="value" style={{ color: 'var(--success)' }}>{fmtMoney(data.stats?.totalPaid)}</div>
              </div>
              <div className="profile-stat">
                <div className="label">Payments Made</div>
                <div className="value">{data.stats?.paymentCount || 0}</div>
              </div>
              <div className="profile-stat">
                <div className="label">Months Active</div>
                <div className="value">{data.stats?.monthsActive || 1}</div>
              </div>
              <div className="profile-stat">
                <div className="label">Last Payment</div>
                <div className="value" style={{ fontSize: '1rem' }}>{fmtDate(data.stats?.lastPaymentDate)}</div>
              </div>
              {data.balance && (
                <div className="profile-stat" style={{ borderColor: data.balance.walletBalance >= 0 ? 'rgba(21,128,61,0.3)' : 'rgba(220,38,38,0.3)' }}>
                  <div className="label">Wallet Balance</div>
                  <div className="value" style={{ color: data.balance.walletBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {data.balance.walletBalance >= 0 ? '+' : ''}{fmtMoney(data.balance.walletBalance)}
                  </div>
                </div>
              )}
            </div>

            <div className="profile-info-row">
              <span className="badge badge-neutral" style={{ fontSize: '0.75rem', padding: '4px 8px', borderColor: 'var(--border)' }}>
                🆔 {data.member.membershipNumber || 'No ID'}
              </span>
              <span>📱 {data.member.phone}</span>
              {data.member.pending_phone && (
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  ➜ NEW: {data.member.pending_phone} (Pending)
                </span>
              )}
              <span>📅 Joined {fmtDate(data.member.joinDate)}</span>
              <span>⏳ Next due {fmtDate(data.member.nextDueDate)}</span>
              <span title="Member has a portal PIN set">
                {data.member.password_hash ? '🔑 PIN set' : '🔓 No PIN'}
              </span>
            </div>

            {/* Payment history table */}
            <h4 style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1.25rem 0 0.6rem' }}>
              Payment History
            </h4>
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Reference</th>
                    <th>Note</th>
                    <th style={{ textAlign: 'center' }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments?.length === 0 ? (
                    <tr className="empty-row"><td colSpan="5">No payments recorded yet.</td></tr>
                  ) : data.payments?.map(p => (
                    <tr key={p.id}>
                      <td className="td-muted td-nowrap">{fmtDate(p.paymentDate)}</td>
                      <td className="td-amount">{fmtMoney(p.amount)}</td>
                      <td className="td-mono">{p.reference || '—'}</td>
                      <td className="td-muted">{p.note || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-ghost btn-icon"
                          style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                          title="Download PDF receipt"
                          onClick={() => downloadBlob(`/api/payments/${p.id}/receipt.pdf`, `receipt_${p.id}.pdf`)}
                        >
                          ⬇ PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* KYC Documents */}
            <h4 style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1.25rem 0 0.6rem', display: 'flex', justifyContent: 'space-between' }}>
              KYC Documents
            </h4>
            <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, marginBottom: '1.25rem' }}>
              {['superadmin', 'admin', 'secretary'].includes((getRole() || '').toLowerCase()) && (
                <form onSubmit={handleUpload} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <select id={`docType-${memberId}`} style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                    <option value="National ID">National ID</option>
                    <option value="KRA PIN">KRA PIN</option>
                    <option value="Passport Photo">Passport Photo</option>
                    <option value="Agreement">Agreement</option>
                    <option value="Other">Other</option>
                  </select>
                  <input type="file" ref={fileRef} accept=".pdf,.jpg,.jpeg,.png" style={{ fontSize: '0.75rem', flex: 1 }} required />
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} disabled={uploading}>
                    {uploading ? '...' : 'Upload'}
                  </button>
                </form>
              )}
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                {docs.length === 0 ? <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>No documents uploaded.</div> : docs.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span>
                      <strong>{d.documentType}</strong> <span style={{color:'var(--text-dim)'}}>({fmtDate(d.uploadDate)})</span>
                      {d.status === 'deleted_by_member' && <span style={{ marginLeft: '0.5rem', color: 'var(--danger)', fontSize: '0.65rem', fontWeight: 600, background: 'rgba(220,38,38,0.1)', padding: '1px 4px', borderRadius: 4 }}>Member Deleted</span>}
                    </span>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <button 
                        onClick={() => viewBlob(`/api/v/doc/${d.filename}`)} 
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
                      >
                        View
                      </button>
                      {['superadmin', 'secretary'].includes((getRole() || '').toLowerCase()) && (
                        <button 
                          onClick={() => handlePermanentDelete(d.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: '0.65rem', fontWeight: 600 }}
                          title="Permanently Delete (Superadmin/Secretary only)"
                        >
                          DELETE
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }}
                onClick={() => downloadBlob(`/api/members/${memberId}/statement.pdf`, `statement_${data.member.name.replace(/\s+/g,'_')}.pdf`)}>
                ⬇ PDF Statement
              </button>
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }}
                onClick={() => downloadBlob(`/api/members/${memberId}/id-card.pdf`, `ID_Card_${data.member.membershipNumber || memberId}.pdf`)}>
                📇 Download ID Card
              </button>
              {isICT && (
                data.member.must_change_password 
                  ? <button className="btn btn-ghost" onClick={handleUnflagReset} disabled={updatingFlag} style={{ fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(220,38,38,0.3)', minWidth: 140 }}>
                      {updatingFlag ? '...' : '🔓 Clear Reset Flag'}
                    </button>
                  : <button className="btn btn-primary" onClick={handleFlagReset} disabled={updatingFlag} style={{ fontSize: '0.8rem', minWidth: 140 }}>
                      {updatingFlag ? '...' : '🛡️ Request Password Reset'}
                    </button>
              )}
              {canManage && data.member.pending_phone && (
                <>
                  <button className="btn btn-success" onClick={handleApprovePhone} style={{ fontSize: '0.8rem' }}>
                    ✅ Approve Phone
                  </button>
                  <button className="btn btn-ghost text-danger" onClick={handleRejectPhone} style={{ fontSize: '0.8rem' }}>
                    ✕ Reject Change
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ─── Set Member PIN Modal ───────────────────────────────────── */
const SetPinModal = ({ member, onClose, onSuccess }) => {
  const [pin,     setPin]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [sendSms, setSendSms] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pin.length < 4)        return setErr('PIN must be at least 4 characters.');
    if (pin !== confirm)       return setErr('Passwords do not match.');
    setSaving(true);
    try {
      const res  = await apiFetch(`/api/members/${member.id}/set-password`, {
        method: 'POST',
        body: JSON.stringify({ password: pin, sendSms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(data.message);
      onClose();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Set PIN — {member.name}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
          Set a numeric PIN or password for this member. Minimum 4 characters.
        </p>
        {err && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '0.85rem' }}>
            <label>New PIN / Password <span className="required">*</span></label>
            <input
              type="password" required minLength={4} autoComplete="new-password"
              value={pin} onChange={e => { setPin(e.target.value); setErr(''); }}
              placeholder="Min 4 characters"
            />
          </div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>Confirm PIN <span className="required">*</span></label>
            <input
              type="password" required minLength={4} autoComplete="new-password"
              value={confirm} onChange={e => { setConfirm(e.target.value); setErr(''); }}
              placeholder="Repeat the PIN"
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', cursor: 'pointer' }}>
            <input
              type="checkbox" checked={sendSms}
              onChange={e => setSendSms(e.target.checked)}
              style={{ width: 14, height: 14 }}
            />
            Send PIN to member via SMS ({member.phone})
          </label>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Setting…' : '🔑 Set PIN'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ─── CSV Import Panel ───────────────────────────────────────── */
const CSVImportPanel = ({ onDone, onCancel }) => {
  const fileRef    = useRef(null);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setErr('Please select a CSV file.');
    setLoading(true); setErr(''); setResult(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res  = await apiFetch('/api/members/import', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (data.imported > 0) onDone();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="card card-highlight" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: 0 }}>📂 CSV Bulk Import</h3>
        <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
      </div>

      <p className="sub">
        Upload a <code>.csv</code> file with columns: <strong>name</strong>, <strong>phone</strong>, joinDate, nextDueDate.<br />
        Missing dates default to today + 30 days. Duplicate phones are skipped.
      </p>

      {err && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}

      {result && (
        <div className="toast toast-success" style={{ marginBottom: '0.75rem' }}>
          ✅ Imported <strong>{result.imported}</strong> members.
          {result.skipped > 0 && ` Skipped ${result.skipped} rows.`}
          {result.errors?.length > 0 && ` Errors: ${result.errors.join('; ')}`}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{
            flex: 1, minWidth: 200,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '0.55rem 0.75rem',
            color: 'var(--text-secondary)', fontSize: '0.85rem'
          }}
        />
        <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
          {loading ? 'Importing…' : '⬆ Import'}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

/* ─── Bulk SMS Panel ─────────────────────────────────────────── */
const BulkSMSPanel = ({ onClose }) => {
  const [form, setForm]   = useState({ message: '', audience: 'all' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const audienceLabels = { all: 'All Active Members', overdue: 'Overdue Members Only', active: 'Up-to-Date Members Only' };

  const handleSend = async () => {
    if (!form.message.trim()) return setErr('Message cannot be empty.');
    setShowConfirm(true); // Trigger custom modal
  };

  const executeSend = async () => {
    setShowConfirm(false);
    setLoading(true); setErr(''); setResult(null);
    try {
      const res  = await apiFetch('/api/sms/bulk', { method: 'POST', body: JSON.stringify(form) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (data.sent === 0 && data.results?.length > 0) {
          const reason = data.results[0]?.status || 'Unknown error';
          setErr(`Delivery failed: ${reason}. Check your Africa's Talking dashboard.`);
      } else {
          setForm({ message: '', audience: 'all' }); // reset on success/partial success
      }
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="card card-highlight" style={{ marginBottom: '1.5rem', borderColor: 'rgba(99,102,241,0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: 0 }}>📣 Bulk Custom SMS</h3>
        <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
      </div>

      {err    && <div className="toast toast-error"   style={{ marginBottom: '0.75rem' }}>{err}</div>}
      {result && (
        <div className="toast toast-success" style={{ marginBottom: '0.75rem' }}>
          ✅ Sent to <strong>{result.sent}</strong> member(s).
          {result.results?.some(r => r.status === 'failed') && ` Some messages failed — check SMS Logs.`}
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Audience</label>
          <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>
            <option value="all">All Active Members</option>
            <option value="overdue">Overdue Members Only</option>
            <option value="active">Up-to-Date Members Only</option>
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>
            Message <span className="required">*</span>
            <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: 'var(--text-dim)' }}>({form.message.length}/160)</span>
          </label>
          <textarea
            rows={4}
            value={form.message}
            onChange={e => setForm({ ...form, message: e.target.value })}
            placeholder="Type your custom message here…"
            style={{ resize: 'vertical', padding: '0.65rem 0.85rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.875rem', width: '100%', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn btn-primary" onClick={handleSend} disabled={loading || !form.message.trim()}>
          {loading ? 'Sending…' : `📨 Send to ${audienceLabels[form.audience]}`}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>

      {result?.results?.length > 0 && (
        <div style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
          {result.results.map((r, i) => (
            <div key={i} style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border)', color: r.status === 'sent' ? 'var(--success)' : 'var(--danger)' }}>
              {r.status === 'sent' ? '✓' : '✗'} {r.member} · {r.phone}
            </div>
          ))}
        </div>
      )}

      {showConfirm && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header"><h3>📣 Confirm SMS Send</h3></div>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              Send this SMS to <strong>"{audienceLabels[form.audience]}"</strong>?
              <br /><br />
              <em style={{ color: 'var(--text-secondary)' }}>"{form.message}"</em>
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
              ({form.message.length} characters)
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={executeSend}>Yes, Send Now</button>
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Main Members Component ─────────────────────────────────── */
const Members = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id');
  
  const [members, setMembers]       = useState([]);
  const [tiers, setTiers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [showCSV, setShowCSV]       = useState(false);
  const [showSMS, setShowSMS]       = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [profileId, setProfileId]   = useState(initialId);
  const [pinMember, setPinMember]   = useState(null); 
  const [confirmDelete, setConfirmDelete] = useState(null); 
  const [toast, setToast]           = useState(null);
  const [editMembershipId, setEditMembershipId] = useState(null);
  const [editMembershipValue, setEditMembershipValue] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const role = (getRole() || 'admin').toLowerCase();
  const canManage = ['superadmin', 'admin', 'secretary', 'finance_admin', 'treasurer', 'ict_admin'].includes(role);
  const isICT = ['superadmin', 'ict_admin'].includes(role);

  // Search & Filter state
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const searchTimer = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const emptyForm = {
    name: '', phone: '', email: '', idNumber: '', dateOfBirth: '',
    joinDate: new Date().toISOString().split('T')[0],
    nextDueDate: '', status: 'active', tierId: '',
    nextOfKinName: '', nextOfKinPhone: '', nextOfKinRelation: '',
    emergencyContact: '', emergencyPhone: ''
  };
  const [form, setForm] = useState(emptyForm);

  const fetchMembers = (q = search) => {
    const params = q ? `?search=${encodeURIComponent(q)}` : '';
    apiFetch(`/api/members${params}`)
      .then(r => r.json())
      .then(d => { setMembers(d.members || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { 
    fetchMembers(); 
    apiFetch('/api/tiers').then(r => r.json()).then(d => setTiers(d.tiers || [])).catch(() => {});
  }, []);

  // Debounced search
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchMembers(val), 350);
  };

  // Client-side status filter
  const filteredMembers = members.filter(m => {
    if (m.status === 'closed') return false; // Strict exclusion
    const days = Math.ceil((new Date(m.nextDueDate) - new Date()) / 86400000);
    if (filterStatus === 'flagged') return !!m.must_change_password;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'inactive') return m.status === 'inactive';
    if (filterStatus === 'overdue') return m.status === 'active' && days < 0;
    if (filterStatus === 'active')  return m.status === 'active' && days >= 0;
    if (filterStatus === 'pending') return m.status === 'pending';
    if (filterStatus === 'phone_change') return m.pending_phone !== null;
    return true;
  });

  const flaggedCount = members.filter(m => !!m.must_change_password).length;
  const pendingCount = members.filter(m => m.status === 'pending').length;
  const phoneChangeCount = members.filter(m => m.pending_phone !== null).length;

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredMembers.length) setSelectedIds([]);
    else setSelectedIds(filteredMembers.map(m => m.id));
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkExport = () => {
    const ids = selectedIds.join(',');
    const url = `/api/export/members?ids=${ids}`;
    downloadBlob(url, `members_export_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handlePdfExport = () => {
    const ids = selectedIds.join(',');
    const url = `/api/export/members.pdf?ids=${ids}`;
    downloadBlob(url, `membership_directory_${new Date().toISOString().split('T')[0]}.pdf`);
  };
  const handleBulkIdCards = () => {
    const ids = selectedIds.join(',');
    const url = `/api/export/bulk-id-cards.pdf?ids=${ids}`;
    downloadBlob(url, `bulk_id_cards_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const openAdd  = () => { setEditingMember(null); setForm(emptyForm); setShowForm(true); setShowCSV(false); setShowSMS(false); };
  const openEdit = (m) => {
    setEditingMember(m);
    setForm({ 
      name: m.name, phone: m.phone, email: m.email || '', 
      idNumber: m.idNumber || '', dateOfBirth: m.dateOfBirth?.split('T')[0] || '',
      joinDate: m.joinDate.split('T')[0], nextDueDate: m.nextDueDate.split('T')[0], 
      status: m.status, tierId: m.tierId || '',
      nextOfKinName: m.nextOfKinName || '', nextOfKinPhone: m.nextOfKinPhone || '', nextOfKinRelation: m.nextOfKinRelation || '',
      emergencyContact: m.emergencyContact || '', emergencyPhone: m.emergencyPhone || ''
    });
    setShowForm(true); setShowCSV(false); setShowSMS(false);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const url    = editingMember ? `/api/members/${editingMember.id}` : '/api/members';
    const method = editingMember ? 'PUT' : 'POST';
    apiFetch(url, { method, body: JSON.stringify(form) })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        fetchMembers();
        setShowForm(false);
        setEditingMember(null);
        showToast(editingMember ? 'Member updated.' : 'Member added.');
      })
      .catch(e => showToast(e.message, 'error'));
  };

  const handleDeleteRequest = (m) => {
    setConfirmDelete(m);
  };

  const executeDelete = async () => {
    const m = confirmDelete;
    setConfirmDelete(null);
    if (!m) return;
    try {
      showToast(`Initiating deletion for ${m.name}...`, 'success');
      await apiFetch(`/api/members/${m.id}`, { method: 'DELETE' });
      showToast(`${m.name} deleted.`);
      fetchMembers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleFlagReset = (member) => {
    showToast(`Requesting reset for ${member.name}...`, 'success');
    apiFetch(`/api/members/${member.id}/flag-reset`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast(d.message); fetchMembers(); })
      .catch(e => showToast(e.message, 'error'));
  };

  // Start editing membershipNumber for a member
  const startEditMembership = (member) => {
    setEditMembershipId(member.id);
    setEditMembershipValue(member.membershipNumber || '');
  };

  const cancelEditMembership = () => {
    setEditMembershipId(null);
    setEditMembershipValue('');
  };

  const saveEditMembership = async (memberId) => {
    if (!editMembershipValue.trim()) return showToast('Membership number cannot be empty.', 'error');
    // Find the existing member data from state to include required fields
    const existingMember = members.find(m => m.id === memberId);
    if (!existingMember) return showToast('Member not found.', 'error');
    // Build payload preserving required fields (name, phone, etc.)
    const payload = {
      ...existingMember,
      membershipNumber: editMembershipValue.trim(),
    };
    // Remove any fields the API may reject (e.g., id, createdAt) if present
    delete payload.id;
    try {
      const res = await apiFetch(`/api/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update membership number');
      showToast('Membership number updated.');
      fetchMembers();
      cancelEditMembership();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleUnflagReset = (member) => {
    showToast(`Clearing reset flag for ${member.name}...`, 'success');
    apiFetch(`/api/members/${member.id}/unflag-reset`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast(d.message); fetchMembers(); })
      .catch(e => showToast(e.message, 'error'));
  };

  const handlePledge = (member) => {
    if (!window.confirm(`Record KES 100 pledge for ${member.name}? Their due date will be extended by 7 days.`)) return;
    apiFetch(`/api/members/${member.id}/pledge`, { method: 'POST', body: JSON.stringify({ recordedBy: 'Admin' }) })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast(d.message); fetchMembers(); })
      .catch(e => showToast(e.message, 'error'));
  };

  const handleApprove = (member) => {
    if (!window.confirm(`Approve membership for ${member.name}? They will be notified via SMS.`)) return;
    showToast(`Activating account for ${member.name}...`, 'success');
    apiFetch(`/api/members/approve/${member.id}`, { method: 'PUT' })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast(d.message); fetchMembers(); })
      .catch(e => showToast(e.message, 'error'));
  };

  const handleApprovePhone = (member) => {
    if (!window.confirm(`Approve phone number change for ${member.name} to ${member.pending_phone}?`)) return;
    showToast(`Updating phone for ${member.name}...`, 'success');
    apiFetch(`/api/members/approve-phone/${member.id}`, { method: 'PUT' })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast(d.message); fetchMembers(); })
      .catch(e => showToast(e.message, 'error'));
  };

  const handleRejectPhone = (member) => {
    if (!window.confirm(`Reject phone number change for ${member.name}?`)) return;
    apiFetch(`/api/members/reject-phone/${member.id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); showToast(d.message); fetchMembers(); })
      .catch(e => showToast(e.message, 'error'));
  };

  const getStatusBadge = (m) => {
    if (m.status === 'pending') return <span className="badge badge-warning">Pending Approval</span>;
    if (m.status === 'inactive') return <span className="badge badge-inactive">Inactive</span>;
    const days = Math.ceil((new Date(m.nextDueDate) - new Date()) / 86400000);
    if (days < 0)  return <span className="badge badge-overdue">Overdue {Math.abs(days)}d</span>;
    if (days <= 3) return <span className="badge badge-pending">Due in {days}d</span>;
    return <span className="badge badge-active">Active</span>;
  };

  const isOverdue = (m) => m.status === 'active' && new Date(m.nextDueDate) < new Date();

  return (
    <div>
      {/* ── Header ── */}
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <Users size={24} />
          </div>
          <div>
            <h2 style={{ marginBottom: 2 }}>Members</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>Register and manage your chama members</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {canManage && (
            <button className="btn btn-ghost" onClick={() => { setShowSMS(s => !s); setShowCSV(false); setShowForm(false); }}>
                <Mail size={16} /> <span>Bulk SMS</span>
            </button>
          )}
          <button className={`btn ${selectedIds.length > 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={handlePdfExport} title="Download Professional PDF Directory">
            <FileText size={16} /> <span>PDF Directory</span>
          </button>
          <button className={`btn ${selectedIds.length > 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={handleBulkIdCards} title="Download Printable ID Cards for Selection">
            <Award size={16} /> <span>Mass ID Cards</span>
          </button>
          <button className="btn btn-ghost" onClick={handleBulkExport} title="Export to CSV Spreadsheet">
            <DownloadCloud size={16} /> <span>CSV</span>
          </button>
          {canManage && <button className="btn btn-primary" onClick={openAdd}><UserPlus size={16} /> <span>Add Member</span></button>}
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* ── Bulk SMS ── */}
      {showSMS && <BulkSMSPanel onClose={() => setShowSMS(false)} />}

      {/* ── CSV Import ── */}
      {showCSV && <CSVImportPanel onDone={() => { fetchMembers(); setShowCSV(false); showToast('CSV imported successfully.'); }} onCancel={() => setShowCSV(false)} />}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <div className="card card-highlight" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ marginBottom: 0 }}>{editingMember ? `Edit — ${editingMember.name}` : 'New Member'}</h3>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}>✕</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Full Name <span className="required">*</span></label>
                <input name="name" required value={form.name} onChange={handleChange} placeholder="Jane Doe" />
              </div>
              <div className="form-group">
                <label>Phone <span className="required">*</span></label>
                <input name="phone" required value={form.phone} onChange={handleChange} placeholder="2547XXXXXXXX" />
              </div>
              <div className="form-group">
                <label>Join Date <span className="required">*</span></label>
                <input type="date" name="joinDate" required value={form.joinDate} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Next Due Date <span className="required">*</span></label>
                <input type="date" name="nextDueDate" required value={form.nextDueDate} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="jane@example.com" />
              </div>
              <div className="form-group">
                <label>ID Number</label>
                <input name="idNumber" value={form.idNumber} onChange={handleChange} placeholder="National ID" />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Contribution Tier</label>
                <select name="tierId" value={form.tierId} onChange={handleChange}>
                  <option value="">None (Default Target)</option>
                  {tiers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} (KES {t.monthlyTarget})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>NOK Name</label>
                <input name="nextOfKinName" value={form.nextOfKinName} onChange={handleChange} placeholder="e.g. Jane Doe" />
              </div>
              <div className="form-group">
                <label>NOK Phone</label>
                <input name="nextOfKinPhone" value={form.nextOfKinPhone} onChange={handleChange} placeholder="e.g. 2547XXXXXXXX" />
              </div>
              <div className="form-group">
                <label>NOK Relation</label>
                <input name="nextOfKinRelation" value={form.nextOfKinRelation} onChange={handleChange} placeholder="e.g. Spouse" />
              </div>
              <div className="form-group">
                <label>Emergency Contact</label>
                <input name="emergencyContact" value={form.emergencyContact} onChange={handleChange} placeholder="e.g. John Doe" />
              </div>
              <div className="form-group">
                <label>Emergency Phone</label>
                <input name="emergencyPhone" value={form.emergencyPhone} onChange={handleChange} placeholder="e.g. 2547XXXXXXXX" />
              </div>
              {editingMember && (
                <div className="form-group">
                  <label>Status</label>
                  <select name="status" value={form.status} onChange={handleChange}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="submit" className="btn btn-primary">
                {editingMember ? 'Save Changes' : 'Register Member'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="search-filter-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={handleSearchChange}
          />
          {search && (
            <button className="search-clear" onClick={() => { setSearch(''); fetchMembers(''); }}>✕</button>
          )}
        </div>
        <div className="filter-chips">
          {[
            { key: 'all',      label: 'All' },
            { key: 'active',   label: '✓ Active' },
            { key: 'overdue',  label: '⚠ Overdue' },
            { key: 'pending',  label: `🕒 New Applications${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { key: 'inactive', label: '— Inactive' },
            { key: 'flagged',  label: `🔴 Reset Required${flaggedCount > 0 ? ` (${flaggedCount})` : ''}` },
            { key: 'phone_change', label: `📱 Phone Change${phoneChangeCount > 0 ? ` (${phoneChangeCount})` : ''}` },
          ].map(f => (
            <button
              key={f.key}
              className={`filter-chip ${filterStatus === f.key ? 'active' : ''}`}
              onClick={() => setFilterStatus(f.key)}
              style={f.key === 'flagged' && flaggedCount > 0 ? { borderColor: 'rgba(220,38,38,0.5)', color: filterStatus === 'flagged' ? '#fff' : 'var(--danger)' } : {}}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-icon" onClick={toggleSelectAll} style={{ padding: 0 }}>
                        {selectedIds.length === filteredMembers.length && filteredMembers.length > 0 ? <CheckSquare size={18} color="var(--accent)" /> : <Square size={18} />}
                    </button>
                </th>
                <th>Mbr #</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Joined</th>
                <th>Next Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan="8">Loading...</td></tr>
              ) : filteredMembers.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan="8">{search ? `No members match "${search}".` : 'No members found.'}</td>
                </tr>
              ) : (
                filteredMembers.map(m => (
                  <tr key={m.id} className={selectedIds.includes(m.id) ? 'row-selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => toggleSelect(m.id)} style={{ padding: 0 }}>
                            {selectedIds.includes(m.id) ? <CheckSquare size={18} color="var(--accent)" /> : <Square size={18} />}
                        </button>
                    </td>
                    <td>
                      {editMembershipId === m.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={editMembershipValue}
                            onChange={e => setEditMembershipValue(e.target.value)}
                            className="input input-sm"
                            style={{ width: 80 }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => saveEditMembership(m.id)} disabled={!editMembershipValue.trim()}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={cancelEditMembership}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span className="badge badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 6px', opacity: 0.8 }}>
                            {m.membershipNumber || '---'}
                          </span>
                          {canManage && (
                            <button className="btn btn-ghost btn-icon" onClick={() => startEditMembership(m)} title="Edit SACCO ID">
                              <Edit size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <button
                        className="member-name-link"
                        onClick={() => setProfileId(m.id)}
                        title="View profile"
                        style={{ fontWeight: 600 }}
                      >
                        {m.name}
                      </button>
                      {!!m.must_change_password && (
                        <span title="This member is required to reset their password on next login" style={{
                          marginLeft: '0.4rem',
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          background: 'rgba(220,38,38,0.15)',
                          color: 'var(--danger)',
                          border: '1px solid rgba(220,38,38,0.35)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          letterSpacing: '0.04em',
                          verticalAlign: 'middle',
                        }}>RESET REQ.</span>
                      )}
                    </td>
                    <td className="td-muted">
                      {m.phone}
                      {m.pending_phone && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>
                          ➜ {m.pending_phone}
                        </div>
                      )}
                    </td>
                    <td className="td-muted">{fmtDate(m.joinDate)}</td>
                    <td>{fmtDate(m.nextDueDate)}</td>
                    <td> {getStatusBadge(m)}</td>
                    <td>
                      <div className="btn-row">
                        {canManage && m.status === 'pending' && <button className="btn btn-primary btn-sm" onClick={() => handleApprove(m)} title="Approve Membership" style={{ height: 28, fontSize: '0.7rem' }}>Approve</button>}
                        {canManage && m.pending_phone && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => handleApprovePhone(m)} title="Approve Phone Change" style={{ height: 28, fontSize: '0.7rem' }}>Approve Phone</button>
                            <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleRejectPhone(m)} title="Reject Phone Change"><X size={16} /></button>
                          </>
                        )}
                        {canManage && <button className="btn btn-ghost btn-icon" onClick={() => openEdit(m)} title="Edit"><Edit size={16} /></button>}
                        {isICT && <button className="btn btn-ghost btn-icon" onClick={() => setPinMember(m)} title="Set PIN"><Key size={16} /></button>}
                        {isICT && (
                          m.must_change_password
                            ? <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => handleUnflagReset(m)}
                                title="Clear password reset flag"
                                style={{ color: 'var(--danger)' }}
                              >
                                <ShieldOff size={16} />
                              </button>
                            : <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => handleFlagReset(m)}
                                title="Request member to reset password"
                              >
                                <ShieldAlert size={16} />
                              </button>
                        )}
                        <button className="btn btn-ghost btn-icon" onClick={() => downloadBlob(`/api/members/${m.id}/id-card.pdf`, `ID_Card_${m.membershipNumber || m.id}.pdf`)} title="Download ID Card"><CreditCard size={16} /></button>
                        {['superadmin', 'admin', 'secretary'].includes((getRole() || '').toLowerCase()) && (
                           <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDeleteRequest(m)} title="Delete"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Profile Modal ── */}
      {profileId   && (
        <ProfileModal 
          memberId={profileId} 
          onClose={() => {
            setProfileId(null);
            if (searchParams.get('id')) {
              setSearchParams({});
            }
          }} 
          onUpdate={fetchMembers} 
          showToast={showToast} 
        />
      )}

      {/* ── Set PIN Modal ── */}
      {pinMember   && (
        <SetPinModal
          member={pinMember}
          onClose={() => setPinMember(null)}
          onSuccess={(msg) => showToast(msg)}
        />
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Confirm Deletion</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>{confirmDelete.name}</strong>?
              <br /><br />
              <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>This action cannot be undone.</span>
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-danger" onClick={executeDelete}>Yes, Delete</button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Members;
