import { useState, useEffect, useCallback } from 'react';
import { apiFetch, memberFetch, getRole, getAdminId, getMemberToken } from '../utils/api';

const Campaigns = () => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [modal,     setModal]     = useState(false);
    const [toast,     setToast]     = useState(null);
    const [form,      setForm]      = useState({ title: '', message: '', audience: 'all', scheduledAt: '' });
    const [busy,      setBusy]      = useState(false);

    const isMember = window.location.pathname.includes('/member/');
    const fetcher = isMember ? memberFetch : apiFetch;

    const load = useCallback(() => {
        setLoading(true);
        fetcher('/api/sms/campaigns').then(r => r.json()).then(d => {
            setCampaigns(d.campaigns || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [fetcher]);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const submit = async (e) => {
        e.preventDefault(); setBusy(true);
        try {
            const r = await fetcher('/api/sms/campaigns', { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            showToast('✓ Campaign scheduled!');
            setModal(false);
            setForm({ title: '', message: '', audience: 'all', scheduledAt: '' });
            load();
        } catch (err) { showToast(err.message, 'error'); }
        setBusy(false);
    };

    const cancelCampaign = async (id) => {
        if (!confirm('Cancel this campaign?')) return;
        try {
            const r = await fetcher(`/api/sms/campaigns/${id}/cancel`, { method: 'POST' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            showToast('Campaign cancelled.');
            load();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const deleteCampaign = async (id) => {
        if (!confirm('Permanently delete this campaign record?')) return;
        try {
            await fetcher(`/api/sms/campaigns/${id}`, { method: 'DELETE' });
            showToast('Campaign deleted.');
            load();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const statusBadge = (s) => {
        const colors = { scheduled: ['#f59e0b', '⏳'], sent: ['var(--success)', '✓'], cancelled: ['var(--danger)', '✕'] };
        const [color, icon] = colors[s] || ['#888', '?'];
        return <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 20, background: `${color}22`, color, border: `1px solid ${color}44` }}>{icon} {s}</span>;
    };

    return (
        <div>
            <div className="section-header">
                <h2>📨 {isMember ? 'Recent Communications' : 'SMS Campaigns'}</h2>
                {!isMember && <button className="btn btn-primary" onClick={() => setModal(true)}>+ Schedule Campaign</button>}
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {/* Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Total', value: campaigns.length, accent: 'var(--accent)' },
                    { label: 'Scheduled', value: campaigns.filter(c => c.status === 'scheduled').length, accent: '#f59e0b' },
                    { label: 'Sent', value: campaigns.filter(c => c.status === 'sent').length, accent: 'var(--success)' },
                ].map(c => (
                    <div key={c.label} className="stat-card" style={{ borderColor: c.accent }}>
                        <div className="label">{c.label}</div>
                        <div className="value" style={{ color: c.accent }}>{c.value}</div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr><th>Title</th><th>Message</th><th>Audience</th><th>Scheduled For</th><th>Status</th><th>Sent At</th>{!isMember && <th style={{ textAlign: 'center' }}>Actions</th>}</tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="empty-row"><td colSpan="7">Loading…</td></tr>
                            ) : campaigns.length === 0 ? (
                                <tr className="empty-row"><td colSpan="7">No campaigns yet. Schedule one!</td></tr>
                            ) : campaigns.map(c => (
                                <tr key={c.id}>
                                    <td style={{ fontWeight: 500 }}>{c.title}</td>
                                    <td style={{ maxWidth: 200, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c.message.substring(0, 60)}{c.message.length > 60 ? '…' : ''}</td>
                                    <td className="td-muted" style={{ textTransform: 'capitalize' }}>{c.audience}</td>
                                    <td className="td-muted td-nowrap">{new Date(c.scheduledAt).toLocaleString('en-GB')}</td>
                                    <td>{statusBadge(c.status)}</td>
                                    <td className="td-muted">{c.sentAt ? new Date(c.sentAt).toLocaleString('en-GB') : '—'}</td>
                                    {!isMember && (
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                {c.status === 'scheduled' && ['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                                    <button className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                                                        onClick={() => cancelCampaign(c.id)}>Cancel</button>
                                                )}
                                                {c.status !== 'sent' && (
                                                    ['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) ? (
                                                        <button className="btn btn-danger btn-icon" onClick={() => deleteCampaign(c.id)} title="Delete">🗑</button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>—</span>
                                                    )
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Modal */}
            {modal && (
                <div className="modal-overlay" onClick={() => setModal(false)}>
                    <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>📨 Schedule SMS Campaign</h3><button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}>✕</button></div>
                        <form onSubmit={submit}>
                            <div className="form-grid">
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Campaign Title <span className="required">*</span></label>
                                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Monthly Reminder" />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Message <span className="required">*</span></label>
                                    <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required placeholder="Type your SMS message…" rows={3} style={{ width: '100%', resize: 'vertical' }} />
                                </div>
                                <div className="form-group">
                                    <label>Audience</label>
                                    <select value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}>
                                        <option value="all">All Active Members</option>
                                        <option value="overdue">Overdue Members Only</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Send At <span className="required">*</span></label>
                                    <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} required />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Scheduling…' : '📨 Schedule'}</button>
                                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


        </div>
    );
};

export default Campaigns;
