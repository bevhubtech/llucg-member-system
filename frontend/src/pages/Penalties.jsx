import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getRole, getAdminId } from '../utils/api';

const fmt = n => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PenaltyModal = ({ members, onClose, onSaved }) => {
    const [form, setForm] = useState({ memberId: '', amount: '', reason: '' });
    const [err,  setErr]  = useState('');
    const [busy, setBusy] = useState(false);
    const h = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await apiFetch('/api/penalties', { method: 'POST', body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSaved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>⚠️ Issue Penalty</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                {err && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}
                <form onSubmit={submit}>
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Member <span className="required">*</span></label>
                            <select name="memberId" value={form.memberId} onChange={h} required>
                                <option value="">Select member…</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.phone}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Amount (KES) <span className="required">*</span></label>
                            <input type="number" name="amount" step="1" min="0" value={form.amount} onChange={h} required placeholder="e.g. 200" />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Reason <span className="required">*</span></label>
                            <input name="reason" value={form.reason} onChange={h} required placeholder="e.g. Late payment, misconduct…" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : '+ Issue Penalty'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PenaltyRuleConfig = ({ showToast }) => {
    const [settings, setSettings] = useState({
        auto_penalty_enabled: 'false',
        auto_penalty_amount: '200',
        auto_penalty_days_overdue: '7',
        penalty_grace_period: '0',
        penalty_sms_enabled: 'true'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setLoadingSaving] = useState(false);

    useEffect(() => {
        apiFetch('/api/settings')
            .then(r => r.json())
            .then(d => {
                const s = {};
                (d.settings || []).forEach(item => {
                    if (settings.hasOwnProperty(item.key)) s[item.key] = item.value;
                });
                setSettings(prev => ({ ...prev, ...s }));
            })
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setLoadingSaving(true);
        try {
            const r = await apiFetch('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({ settings: Object.entries(settings).map(([key, value]) => ({ key, value })) })
            });
            if (!r.ok) throw new Error('Failed to save settings');
            showToast('✓ Penalty rules updated successfully.');
        } catch (e) { showToast(e.message, 'error'); }
        setLoadingSaving(false);
    };

    if (loading) return <div className="card">Loading rules...</div>;

    return (
        <div className="card shadow-lg" style={{ marginBottom: '2rem', border: '1px solid var(--accent-dim)', background: 'var(--surface-2)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🤖 Automated Penalty Rules
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                <div className="form-group">
                    <label>Enable Auto-Penalty</label>
                    <select value={settings.auto_penalty_enabled} onChange={e => setSettings({...settings, auto_penalty_enabled: e.target.value})}>
                        <option value="true">Active (Daily Scan)</option>
                        <option value="false">Disabled</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Penalty Amount (KES)</label>
                    <input type="number" step="1" value={settings.auto_penalty_amount} onChange={e => setSettings({...settings, auto_penalty_amount: e.target.value})} />
                </div>
                <div className="form-group">
                    <label>Days Overdue Before Charge</label>
                    <input type="number" value={settings.auto_penalty_days_overdue} onChange={e => setSettings({...settings, auto_penalty_days_overdue: e.target.value})} />
                </div>
                <div className="form-group">
                    <label>Grace Period (Extra Days)</label>
                    <input type="number" value={settings.penalty_grace_period} onChange={e => setSettings({...settings, penalty_grace_period: e.target.value})} />
                </div>
                <div className="form-group">
                    <label>SMS Notifications</label>
                    <select value={settings.penalty_sms_enabled} onChange={e => setSettings({...settings, penalty_sms_enabled: e.target.value})}>
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                    </select>
                </div>
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Rule Configuration'}
                </button>
            </div>
        </div>
    );
};

const Penalties = () => {
    const [penalties, setPenalties] = useState([]);
    const [members,   setMembers]   = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [filter,    setFilter]    = useState('all');
    const [search,    setSearch]    = useState('');
    const [modal,     setModal]     = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [toast,     setToast]     = useState(null);
    const [busy,      setBusy]      = useState(null); // id being marked paid
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            apiFetch('/api/penalties').then(r => r.json()),
            apiFetch('/api/members').then(r => r.json()),
        ]).then(([p, m]) => {
            setPenalties(p.penalties || []);
            setMembers((m.members || []).filter(m => m.status === 'active'));
            setLoading(false);
        });
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const markPaid = async (id) => {
        setBusy(id);
        try {
            const r = await apiFetch(`/api/penalties/${id}/pay`, { method: 'PUT' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            showToast('✓ Penalty marked as paid.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
        setBusy(null);
    };

    const deletePenaltyRequest = (id) => {
        setConfirmDelete(id);
    };

    const executeDeletePenalty = async () => {
        const id = confirmDelete;
        setConfirmDelete(null);
        if (!id) return;
        try {
            await apiFetch(`/api/penalties/${id}`, { method: 'DELETE' });
            showToast('Penalty deleted.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
    };

    const filtered = penalties.filter(p => {
        if (filter !== 'all' && p.paidStatus !== filter) return false;
        if (search && !p.memberName?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const totalUnpaid    = penalties.filter(p => p.paidStatus === 'unpaid').reduce((s, p) => s + p.amount, 0);
    const totalCollected = penalties.filter(p => p.paidStatus === 'paid').reduce((s, p) => s + p.amount, 0);

    return (
        <div>
            <div className="section-header">
                <h2>⚠️ Penalty Management</h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={() => setShowRules(!showRules)}>
                        {showRules ? 'Hide Rules' : '⚙️ Penalty Rules'}
                    </button>
                    <button className="btn btn-primary" onClick={() => setModal(true)}>+ Issue Penalty</button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {showRules && <PenaltyRuleConfig showToast={showToast} />}

            {/* Summary cards */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Total Penalties', value: penalties.length },
                    { label: 'Unpaid Amount', value: `KES ${fmt(totalUnpaid)}`, accent: 'var(--danger)' },
                    { label: 'Collected', value: `KES ${fmt(totalCollected)}`, accent: 'var(--success)' },
                ].map(c => (
                    <div key={c.label} className="stat-card" style={c.accent ? { borderColor: c.accent } : {}}>
                        <div className="label">{c.label}</div>
                        <div className="value" style={c.accent ? { color: c.accent } : {}}>{c.value}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search member name…" style={{ flex: 1, minWidth: 200 }} />
                    {['all','unpaid','paid'].map(s => (
                        <button key={s} onClick={() => setFilter(s)}
                            className={`btn ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ textTransform: 'capitalize', padding: '0.4rem 0.9rem' }}>
                            {s === 'all' ? 'All' : s === 'unpaid' ? '🔴 Unpaid' : '🟢 Paid'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th><th>Member</th><th>Amount</th><th>Type</th><th>Reason</th>
                                <th>Issued</th><th>Status</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="empty-row"><td colSpan="8">Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr className="empty-row"><td colSpan="8">No penalties found.</td></tr>
                            ) : filtered.map(p => (
                                <tr key={p.id}>
                                    <td className="td-muted">#{p.id}</td>
                                    <td style={{ fontWeight: 500 }}>{p.memberName}</td>
                                    <td style={{ color: 'var(--danger)', fontWeight: 600 }}>KES {fmt(p.amount)}</td>
                                    <td>
                                        <span style={{ 
                                            fontSize: '0.62rem', fontWeight: 800, padding: '0.1rem 0.4rem', 
                                            borderRadius: 4, background: p.reason.includes('Automated') ? 'var(--accent-hover)' : 'var(--hover-bg)', 
                                            color: p.reason.includes('Automated') ? '#fff' : 'var(--text-secondary)',
                                            textTransform: 'uppercase'
                                        }}>
                                            {p.reason.includes('Automated') ? '🤖 Auto' : '👤 Admin'}
                                        </span>
                                    </td>
                                    <td style={{ maxWidth: 220 }}>{p.reason}</td>
                                    <td className="td-muted">{new Date(p.issuedDate).toLocaleDateString('en-GB')}</td>
                                    <td>
                                        <span style={{
                                            fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem',
                                            borderRadius: 20,
                                            background: p.paidStatus === 'paid' ? 'rgba(21,128,61,0.15)' : 'rgba(220,38,38,0.15)',
                                            color: p.paidStatus === 'paid' ? 'var(--success)' : 'var(--danger)',
                                            border: `1px solid ${p.paidStatus === 'paid' ? 'rgba(21,128,61,0.4)' : 'rgba(220,38,38,0.4)'}`,
                                        }}>
                                            {p.paidStatus === 'paid' ? '✓ Paid' : '● Unpaid'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                        {p.paidStatus === 'unpaid' && (
                                            <button className="btn btn-primary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                                                disabled={busy === p.id} onClick={() => markPaid(p.id)}>
                                                {busy === p.id ? '…' : '✓ Mark Paid'}
                                            </button>
                                        )}
                                        {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                            <button className="btn btn-danger btn-icon" onClick={() => deletePenaltyRequest(p.id)} title="Delete">🗑</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal && <PenaltyModal members={members} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); showToast('Penalty issued successfully.'); }} />}
            {/* ── Confirm Delete Modal ── */}
            {confirmDelete && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3>Confirm Deletion</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Are you sure you want to permanently delete this penalty?
                            <br /><br />
                            <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>This action cannot be undone.</span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-danger" onClick={executeDeletePenalty}>Yes, Delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Penalties;
