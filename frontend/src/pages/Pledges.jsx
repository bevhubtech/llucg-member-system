import { useState, useEffect, useCallback } from 'react';
import { apiFetch, downloadBlob, getRole } from '../utils/api';
import { 
    Handshake, Search, X, CheckSquare, Square, Trash2, Edit3, 
    TrendingUp, PieChart as PieIcon, Calendar, BarChart3, Filter
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    Cell, PieChart, Pie
} from 'recharts';

const fmt = n => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── Named Modal Components ─── */

const ConfirmModal = ({ title, message, onConfirm, onClose, busy, confirmText = 'Confirm', variant = 'primary' }) => (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
        <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose}>✕</button></div>
            <div style={{ padding: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>{message}</div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className={`btn btn-${variant}`} onClick={onConfirm} disabled={busy}>{busy ? 'Processing...' : confirmText}</button>
                <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            </div>
        </div>
    </div>
);

const NoteModal = ({ pledge, onClose, onSaved }) => {
    const [note, setNote] = useState(pledge.note || '');
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault(); setBusy(true);
        try {
            const res = await apiFetch(`/api/pledges/${pledge.id}/note`, { method: 'PUT', body: JSON.stringify({ note }) });
            if (!res.ok) throw new Error('Failed to update note');
            onSaved('Transparency note updated.');
        } catch (e) { alert(e.message); }
        setBusy(false);
    };
    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
            <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>📝 Transparency Note</h3><button className="btn btn-ghost" onClick={onClose}>✕</button></div>
                <form onSubmit={submit}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>Add details for audit transparency (e.g. M-Pesa reference, reason for extension).</p>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} style={{ width: '100%', marginBottom: '1rem' }} placeholder="Enter note here..." />
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save Note'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

/* ─── Main Component ─── */

const Pledges = () => {
    const [pledges, setPledges] = useState([]);
    const [monthlyData, setMonthlyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search,  setSearch]  = useState('');
    const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' or 'analytics'
    const [toast,   setToast]   = useState(null);
    const [pledgeFee, setPledgeFee] = useState('100');
    
    // UI State for Modals
    const [showIssue, setShowIssue] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [confirmHonor, setConfirmHonor] = useState(null);
    const [editNote, setEditNote] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const role = (getRole() || '').toLowerCase();
    const isFinance = ['finance_admin', 'treasurer', 'superadmin', 'admin'].includes(role);
    const canDelete = ['superadmin', 'admin'].includes(role);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            apiFetch('/api/pledges').then(r => r.json()),
            apiFetch('/api/settings').then(r => r.json()),
            apiFetch('/api/reports/pledges-monthly').then(r => r.json())
        ]).then(([d, s, m]) => {
            setPledges(d.pledges || []);
            setMonthlyData(m.monthly || []);
            if (s.settings?.pledge_fee) setPledgeFee(s.settings.pledge_fee);
            setLoading(false);
        }).catch(e => { showToast(e.message, 'error'); setLoading(false); });
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    // --- Row Handlers ---

    const handleFulfill = async () => {
        const id = confirmHonor; setConfirmHonor(null);
        if (!id) return;
        setBusyId(id);
        try {
            const res = await apiFetch(`/api/pledges/${id}/fulfill`, { method: 'PUT' });
            if (!res.ok) throw new Error('Failed to fulfill commitment');
            showToast('Commitment marked as honored.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
        setBusyId(null);
    };

    const handleDelete = async () => {
        const id = confirmDelete; setConfirmDelete(null);
        if (!id) return;
        setBusyId(id);
        try {
            const res = await apiFetch(`/api/pledges/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete pledge');
            showToast('Pledge record removed.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
        setBusyId(null);
    };

    const handlePayFee = async (pledge) => {
        setBusyId(pledge.id);
        try {
            const res = await apiFetch(`/api/penalties/${pledge.penaltyId}/pay`, { method: 'PUT' });
            if (!res.ok) throw new Error('Payment failed');
            showToast('Pledge fee marked as paid.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
        setBusyId(null);
    };

    const filtered = pledges.filter(p => p.memberName?.toLowerCase().includes(search.toLowerCase()) || p.memberPhone?.includes(search));

    // Stats for Pie Chart
    const statusStats = [
        { name: 'Honored', value: pledges.filter(p => p.status === 'fulfilled').length, color: '#10b981' },
        { name: 'Pending', value: pledges.filter(p => p.status !== 'fulfilled').length, color: '#f59e0b' }
    ];

    return (
        <div style={{ paddingBottom: '3rem' }}>
            <div className="section-header">
                <div>
                    <h2>Commitment Pledges</h2>
                    <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }}>
                        <button 
                            className={`btn ${activeTab === 'ledger' ? 'btn-primary' : 'btn-ghost'}`} 
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                            onClick={() => setActiveTab('ledger')}
                        >
                            📋 Active Ledger
                        </button>
                        <button 
                            className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-ghost'}`} 
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                            onClick={() => setActiveTab('analytics')}
                        >
                            📊 Monthly Data
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    {isFinance && (
                        <button className="btn btn-primary" onClick={() => setShowIssue(true)}>
                            <Handshake size={16} style={{ marginRight: '0.4rem' }} /> New Pledge
                        </button>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--card-bg)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadBlob('/api/export/pledges.pdf', 'pledges_report.pdf')}>📄 PDF</button>
                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => downloadBlob('/api/export/pledges', 'pledges_data.csv')}>📊 CSV</button>
                    </div>
                    <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1.5rem' }}>{toast.msg}</div>}

            {activeTab === 'ledger' ? (
                <>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
                        <div className="stat-card"><div className="label">Active Pledges</div><div className="value">{pledges.length}</div></div>
                        <div className="stat-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                            <div className="label">Accrued Revenue</div>
                            <div className="value">KES {fmt(pledges.reduce((sum, p) => sum + (p.pledgeFee || 0), 0))}</div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <Search size={18} style={{ color: 'var(--text-dim)', marginLeft: '1rem' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search member commitments..." style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none' }} />
                        </div>
                    </div>

                    <div className="card">
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Member Details</th>
                                        <th>Target Date</th>
                                        <th>Fee</th>
                                        <th>Fee Status</th>
                                        <th>Commitment</th>
                                        <th style={{ textAlign:'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? <tr className="empty-row"><td colSpan="7">Loading…</td></tr> : 
                                     filtered.length === 0 ? <tr className="empty-row"><td colSpan="7">No records found.</td></tr> :
                                     filtered.map(p => (
                                        <tr key={p.id} style={{ opacity: busyId === p.id ? 0.5 : 1 }}>
                                            <td className="td-muted">#{p.id}</td>
                                            <td><div style={{ fontWeight: 600 }}>{p.memberName}</div><div className="td-muted" style={{ fontSize: '0.75rem' }}>{p.memberPhone}</div></td>
                                            <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{new Date(p.targetDate).toLocaleDateString('en-GB')}</td>
                                            <td className="td-muted">KES {fmt(p.pledgeFee)}</td>
                                            <td>
                                                <span className={`badge ${p.paidStatus === 'paid' ? 'badge-success' : 'badge-danger'}`}>
                                                    {p.paidStatus === 'paid' ? 'FEE PAID' : 'UNPAID'}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                    <span className={`badge ${p.status === 'fulfilled' ? 'badge-success' : 'badge-warning'}`}>
                                                        {p.status === 'fulfilled' ? 'HONORED' : 'PENDING'}
                                                    </span>
                                                    {p.note && <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontStyle: 'italic', maxWidth: 140 }}>"{p.note}"</div>}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                    {p.paidStatus !== 'paid' && p.penaltyId && (
                                                        <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }} onClick={() => handlePayFee(p)} disabled={busyId === p.id}>Fee Paid</button>
                                                    )}
                                                    {p.status !== 'fulfilled' && (
                                                        <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', background: '#10b981' }} onClick={() => setConfirmHonor(p.id)} disabled={busyId === p.id}>Honor</button>
                                                    )}
                                                    <button className="btn btn-ghost" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }} onClick={() => setEditNote(p)} title="Add transparency note"><Edit3 size={14} /></button>
                                                    {canDelete && (
                                                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', color: 'var(--danger)' }} onClick={() => setConfirmDelete(p.id)} disabled={busyId === p.id}><Trash2 size={14} /></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                     ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div style={{ animation: 'fadeIn 0.3s ease-in' }}>
                    <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                        <div className="stat-card" style={{ borderColor: '#10b981' }}>
                            <div className="label">Total Fulfillment Rate</div>
                            <div className="value">{pledges.length > 0 ? Math.round((pledges.filter(p => p.status === 'fulfilled').length / pledges.length) * 100) : 0}%</div>
                            <div className="label" style={{ fontSize: '0.7rem', marginTop: '4px' }}>Across all time recorded pledges</div>
                        </div>
                        <div className="stat-card" style={{ borderColor: '#2563eb' }}>
                            <div className="label">Revenue Captured</div>
                            <div className="value">KES {fmt(pledges.filter(p => p.paidStatus === 'paid').reduce((s, p) => s + (p.pledgeFee || 0), 0))}</div>
                            <div className="label" style={{ fontSize: '0.7rem', marginTop: '4px' }}>From settled commitment fees</div>
                        </div>
                    </div>

                    <div className="grid" style={{ gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
                        <div className="card">
                            <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <TrendingUp size={18} color="var(--accent)" /> Monthly Pledge Volume Trends
                            </h3>
                            <div style={{ width: '100%', height: 350 }}>
                                <ResponsiveContainer>
                                    <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => {
                                            const [y, m] = val.split('-');
                                            return new Date(y, m - 1).toLocaleString('default', { month: 'short' });
                                        }} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            cursor={{ fill: '#f8fafc' }}
                                        />
                                        <Legend verticalAlign="top" height={36} />
                                        <Bar dataKey="total" name="Total Pledges" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                                        <Bar dataKey="honored" name="Honored" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Commitment Status Mix</h3>
                                <div style={{ width: '100%', height: 200 }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie 
                                                data={statusStats} 
                                                innerRadius={60} 
                                                outerRadius={80} 
                                                paddingAngle={5} 
                                                dataKey="value"
                                            >
                                                {statusStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                                    {statusStats.map(s => (
                                        <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                                            <span>{s.name}: {s.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
                                <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <TrendingUp size={16} color="var(--accent)" /> Latest Month Revenue
                                </h3>
                                {monthlyData.length > 0 ? (
                                    <>
                                        <div className="value" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
                                            KES {fmt(monthlyData[monthlyData.length - 1].revenue)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                            Generated from commitment fees in {monthlyData[monthlyData.length - 1].month}
                                        </div>
                                    </>
                                ) : <div className="td-muted">No data available</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showIssue && <IssuePledgeModal onClose={() => setShowIssue(false)} onSuccess={(msg) => { showToast(msg); load(); }} />}
            
            {confirmDelete && (
                <ConfirmModal 
                    title="Confirm Deletion" 
                    message="Are you sure you want to permanently remove this pledge record from the ledger?"
                    confirmText="Delete Record"
                    variant="danger"
                    onConfirm={handleDelete}
                    onClose={() => setConfirmDelete(null)}
                    busy={busyId === confirmDelete}
                />
            )}

            {confirmHonor && (
                <ConfirmModal 
                    title="Mark Commitment Honored" 
                    message="Has this member successfully fulfilled the commitment associated with this pledge? This action will be logged for transparency."
                    confirmText="✓ Mark Honored"
                    variant="primary"
                    onConfirm={handleFulfill}
                    onClose={() => setConfirmHonor(null)}
                    busy={busyId === confirmHonor}
                />
            )}

            {editNote && <NoteModal pledge={editNote} onClose={() => setEditNote(null)} onSaved={(msg) => { showToast(msg); setEditNote(null); load(); }} />}
        </div>
    );
};

/* ─── Issue Pledge Modal ─────────────────────────────────────── */

const IssuePledgeModal = ({ onClose, onSuccess }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        apiFetch('/api/members').then(r => r.json()).then(d => { 
            setMembers((d.members || []).filter(m => m.status === 'active')); 
            setLoading(false); 
        }).catch(() => setLoading(false));
    }, []);

    const handleIssue = async () => {
        if (!selected) return;
        setBusy(true);
        try {
            const res = await apiFetch(`/api/members/${selected.id}/pledge`, { method: 'POST', body: JSON.stringify({ recordedBy: 'Admin' }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onSuccess(data.message);
            onClose();
        } catch (e) { alert(e.message); }
        setBusy(false);
    };

    const filtered = members.filter(m => m.name?.toLowerCase().includes(search.toLowerCase()) || m.phone?.includes(search));

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
            <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Record Commitment Pledge</h3><button className="btn btn-ghost" onClick={onClose}>✕</button></div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Assign a pledge fee and extend the financial deadline for a member.</p>
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-dim)' }} />
                    <input className="search-input" style={{ paddingLeft: 40 }} placeholder="Search member..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table style={{ margin: 0 }}>
                        <tbody>
                            {loading ? <tr><td className="td-muted" style={{ textAlign:'center', padding:'2rem' }}>Loading...</td></tr> : 
                             filtered.length === 0 ? <tr><td className="td-muted" style={{ textAlign:'center', padding:'2rem' }}>No members found.</td></tr> :
                             filtered.map(m => (
                                <tr key={m.id} onClick={() => setSelected(m)} style={{ cursor: 'pointer', background: selected?.id === m.id ? 'var(--accent-dim)' : 'transparent' }}>
                                    <td style={{ width: 40 }}>{selected?.id === m.id ? <CheckSquare size={18} color="var(--accent)" /> : <Square size={18} />}</td>
                                    <td><div style={{ fontWeight: 600 }}>{m.name}</div><div className="td-muted" style={{ fontSize: '0.75rem' }}>{m.membershipNumber}</div></td>
                                    <td className="td-muted" style={{ textAlign: 'right', fontSize: '0.75rem' }}>Due {new Date(m.nextDueDate).toLocaleDateString()}</td>
                                </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} disabled={!selected || busy} onClick={handleIssue}>{busy ? 'Recording...' : selected ? `Confirm for ${selected.name.split(' ')[0]}` : 'Select a Member'}</button>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default Pledges;
