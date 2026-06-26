import { useState, useEffect } from 'react';
import { apiFetch, getRole, getAdminId } from '../utils/api';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB') : '—';

const AdminVoteModal = ({ poll, onClose, onSaved }) => {
    const [members, setMembers] = useState([]);
    const [form, setForm] = useState({ memberId: '', optionId: '' });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    useEffect(() => {
        apiFetch('/api/members').then(r => r.json()).then(d => { setMembers(d.members || []); setLoading(false); });
    }, []);

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await apiFetch(`/api/polls/${poll.id}/admin-vote`, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSaved();
        } catch (err) { setErr(err.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>🗳️ Enter Proxy Vote</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Log a vote manually on behalf of a member for: <br/><b>{poll.question}</b></p>
                {err && <div className="toast toast-error" style={{ marginBottom: '1rem' }}>{err}</div>}
                
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label>Member <span className="required">*</span></label>
                        <select name="memberId" value={form.memberId} onChange={e=>setForm({...form, memberId:e.target.value})} required>
                            <option value="">Select a member...</option>
                            {loading ? <option disabled>Loading...</option> : members.filter(m => m.status==='active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Vote Option <span className="required">*</span></label>
                        <select name="optionId" value={form.optionId} onChange={e=>setForm({...form, optionId:e.target.value})} required>
                            <option value="">Select option...</option>
                            {poll.options.map(o => <option key={o.id} value={o.id}>{o.optionText}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy || loading}>{busy?'Submitting...':'Submit Vote'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Polls = () => {
    const [polls, setPolls] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [voteModal, setVoteModal] = useState(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const [form, setForm] = useState({ question: '', closeDate: '', options: ['', ''] });

    const showMsg = (msg, type = 'success') => { setToast({msg, type}); setTimeout(() => setToast(null), 3000); };

    const loadPolls = () => {
        setLoading(true);
        apiFetch('/api/polls').then(r => r.json()).then(pollData => {
            setPolls(pollData.polls || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    };
    useEffect(loadPolls, []);

    const handleAddOption = () => setForm({ ...form, options: [...form.options, ''] });
    const handleOptionChange = (i, val) => {
        const newOpts = [...form.options];
        newOpts[i] = val;
        setForm({ ...form, options: newOpts });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const validOpts = form.options.map(o => o.trim()).filter(Boolean);
        if (validOpts.length < 2) return showMsg('Wait! Provide at least 2 options.', 'error');
        setSaving(true);
        try {
            const res = await apiFetch('/api/polls', { method: 'POST', body: JSON.stringify({ ...form, options: validOpts }) });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg('Poll created successfully.');
            setShowForm(false); loadPolls();
        } catch (e) { showMsg(e.message, 'error'); }
        setSaving(false);
    };

    const handleClosePoll = async (id) => {
        if (!window.confirm('Close this poll to further voting?')) return;
        try {
            const res = await apiFetch(`/api/polls/${id}/close`, { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg('Poll closed.');
            loadPolls();
        } catch (e) { showMsg(e.message, 'error'); }
    };

    const deletePoll = async (id) => {
        if (!confirm('Permanently delete this poll and all its votes?')) return;
        try {
            const res = await apiFetch(`/api/polls/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg('Poll deleted.');
            loadPolls();
        } catch (e) { showMsg(e.message, 'error'); }
    };

    return (
        <div>
            <div className="section-header">
                <h2>Member Voting & Resolutions</h2>
                <button className="btn btn-primary" onClick={() => { setForm({ question: '', closeDate: '', options: ['', ''] }); setShowForm(true); }}>
                    + Create Poll
                </button>
            </div>
            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {showForm && (
                <div className="card card-highlight" style={{ marginBottom: '1.5rem', borderColor: 'rgba(99,102,241,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>New Resolution Poll</h3>
                        <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}>✕</button>
                    </div>
                    <form onSubmit={handleCreate}>
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label>Question or Resolution</label>
                            <input required value={form.question} onChange={e => setForm({...form, question: e.target.value})} placeholder="e.g. Should we buy Ruiru plots?" />
                        </div>
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label>Close Date (Optional)</label>
                            <input type="date" value={form.closeDate} onChange={e => setForm({...form, closeDate: e.target.value})} />
                        </div>
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label>Voting Options</label>
                            {form.options.map((opt, i) => (
                                <input key={i} required style={{ marginBottom: '0.5rem' }} value={opt} onChange={e => handleOptionChange(i, e.target.value)} placeholder={`Option ${i+1}`} />
                            ))}
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', marginTop: '0.2rem' }} onClick={handleAddOption}>+ Add Option</button>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving...':'Launch Poll'}</button>
                            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} style={{ marginLeft: '1rem' }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {loading ? <p>Loading polls...</p> : polls.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No polls exist.</p> : polls.map(p => {
                    const totalVotes = p.totalVotes || p.votes.length;
                    const isClosed = p.status === 'closed' || (p.closeDate && new Date() > new Date(p.closeDate));
                    return (
                        <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding:'0.2rem 0.6rem', borderRadius:20, background: isClosed?'rgba(220,38,38,0.1)':'rgba(21,128,61,0.1)', color: isClosed?'var(--danger)':'var(--success)' }}>
                                    {isClosed ? 'CLOSED' : 'ACTIVE'}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{fmtDate(p.timestamp)}</span>
                            </div>
                            <h4 style={{ margin: '0 0 1rem 0' }}>{p.question}</h4>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                {p.options.map(o => {
                                    const vCount = o.votes || 0;
                                    const pct = totalVotes > 0 ? ((vCount / totalVotes) * 100).toFixed(1) : 0;
                                    return (
                                        <div key={o.id} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: 'rgba(99,102,241,0.15)', zIndex: 0 }} />
                                            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                                <span>{o.optionText}</span>
                                                <span style={{ fontWeight: 600 }}>{vCount} ({pct}%)</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Votes: <strong>{totalVotes}</strong></span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    {!isClosed && <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setVoteModal(p)}>🗳️ Proxy</button>}
                                    {!isClosed && <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: '#f59e0b', padding: '0.2rem 0.5rem' }} onClick={() => handleClosePoll(p.id)}>Close</button>}
                                    
                                    {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                        <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)', padding: '0.2rem 0.4rem' }} onClick={() => deletePoll(p.id)} title="Delete">🗑</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {voteModal && <AdminVoteModal poll={voteModal} onClose={() => setVoteModal(null)} onSaved={() => { setVoteModal(null); loadPolls(); showMsg('Proxy vote recorded.'); }} />}

        </div>
    );
};
export default Polls;
