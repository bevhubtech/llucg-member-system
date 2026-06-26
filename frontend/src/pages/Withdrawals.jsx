import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getRole } from '../utils/api';

const fmt = n => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Withdrawals = () => {
    const [withdrawals, setWithdrawals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [resolve, setResolve] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        apiFetch('/api/withdrawals').then(r => r.json()).then(data => {
            setWithdrawals(data.withdrawals || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const handleResolve = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        try {
            const res = await apiFetch(`/api/withdrawals/${resolve.id}/resolve`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    status: data.status, 
                    reviewerNotes: data.reviewerNotes,
                    automateMpesa: !!data.automateMpesa
                })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            showToast(`Withdrawal ${data.status} successfully.`);
            setResolve(null);
            load();
        } catch (e) { showToast(e.message, 'error'); }
    };

    return (
        <div>
            <div className="section-header">
                <h2>💸 Withdrawal Management</h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {withdrawals.filter(w => w.status === 'pending').length} request(s) awaiting approval
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Member</th>
                                <th>Phone</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="empty-row"><td colSpan="6">Loading requests…</td></tr>
                            ) : withdrawals.length === 0 ? (
                                <tr className="empty-row"><td colSpan="6">No withdrawal requests found.</td></tr>
                            ) : withdrawals.map(w => (
                                <tr key={w.id}>
                                    <td className="td-muted">{new Date(w.requestedDate).toLocaleDateString('en-GB')}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{w.memberName}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{w.membershipNumber}</div>
                                    </td>
                                    <td className="td-muted">{w.phone}</td>
                                    <td style={{ fontWeight: 700 }}>KES {fmt(w.amount)}</td>
                                    <td>
                                        <span className={`badge badge-${w.status === 'disbursed' || w.status === 'approved' ? 'success' : w.status === 'rejected' ? 'danger' : 'warning'}`} style={{ textTransform: 'capitalize' }}>
                                            {w.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {w.status === 'pending' && (
                                            <button className="btn btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setResolve(w)}>Review</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {resolve && (
                <div className="modal-overlay" onClick={() => setResolve(null)}>
                    <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Review Withdrawal Request</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setResolve(null)}>✕</button>
                        </div>
                        <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8, fontSize: '0.85rem' }}>
                            <div>Member: <b>{resolve.memberName}</b></div>
                            <div>Requested: <b>KES {fmt(resolve.amount)}</b></div>
                            <div>Destination: <b>{resolve.phone}</b></div>
                        </div>

                        <form onSubmit={handleResolve}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Action <span className="required">*</span></label>
                                <select name="status" required>
                                    <option value="approved">✅ Approve Request</option>
                                    <option value="rejected">❌ Reject & Reverse Funds</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Reviewer Notes</label>
                                <textarea name="reviewerNotes" rows={3} placeholder="Optional notes..." style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(16,185,129,0.05)', border: '1px dashed var(--success)', borderRadius: 8 }}>
                                <input type="checkbox" name="automateMpesa" id="automateMpesa" style={{ width: 18, height: 18 }} />
                                <label htmlFor="automateMpesa" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: 'var(--success)' }}>
                                    🚀 Automate M-Pesa Payout
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Decision</button>
                                <button type="button" className="btn btn-ghost" onClick={() => setResolve(null)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Withdrawals;
