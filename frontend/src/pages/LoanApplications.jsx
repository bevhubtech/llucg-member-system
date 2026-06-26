import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getRole, getAdminId, downloadBlob } from '../utils/api';

const fmt = n => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LoanApplications = () => {
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [resolve, setResolve] = useState(null); // The application being resolved
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [fundLiquidity, setFundLiquidity] = useState(null);
    const [selectedFund, setSelectedFund] = useState('Member Savings');

    const load = useCallback(() => {
        apiFetch('/api/loans/applications').then(r => r.json()).then(appData => {
            setApps(appData.applications || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    useEffect(() => {
        if (resolve) {
            apiFetch(`/api/reports/savings-summary`).then(r => r.json()).then(d => {
                setFundLiquidity(d.totalGroupBalance || 0); 
            });
        }
    }, [resolve, selectedFund]);

    const handleResolve = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        try {
            const res = await apiFetch(`/api/loans/applications/${resolve.id}/resolve`, {
                method: 'PUT',
                body: JSON.stringify({ 
                    status: data.status, 
                    reviewerNotes: data.reviewerNotes, 
                    interestRate: parseFloat(data.interestRate || 0),
                    automateMpesa: !!data.automateMpesa,
                    fundingSource: selectedFund
                })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            showToast(`Application ${status} successfully.`);
            setResolve(null);
            load();
        } catch (e) { showToast(e.message, 'error'); }
    };

    const deleteApplicationRequest = (id) => {
        setConfirmDelete(id);
    };

    const executeDeleteApplication = async () => {
        const id = confirmDelete;
        setConfirmDelete(null);
        if (!id) return;
        try {
            const r = await apiFetch(`/api/loans/applications/${id}`, { method: 'DELETE' });
            if (!r.ok) {
                const d = await r.json();
                throw new Error(d.error || 'Server error');
            }
            showToast('Application deleted.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
    };

    return (
        <div>
            <div className="section-header">
                <div>
                    <h2>📋 Loan Applications</h2>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {apps.filter(a => a.status === 'pending').length} application(s) awaiting review
                    </div>
                </div>
                <button 
                    className="btn btn-primary" 
                    style={{ background: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => downloadBlob('/api/export/loan-portfolio.pdf', 'Global_Loan_Portfolio.pdf')}
                >
                    📥 Export Loan Portfolio (PDF)
                </button>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Member</th>
                                <th>Amount</th>
                                <th>Tenure</th>
                                <th>Reason</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="empty-row"><td colSpan="8">Loading applications…</td></tr>
                            ) : apps.length === 0 ? (
                                <tr className="empty-row"><td colSpan="8">No loan applications found.</td></tr>
                            ) : apps.map(a => (
                                <tr key={a.id}>
                                    <td className="td-muted">#{a.id}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.memberName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{a.memberPhone}</div>
                                    </td>
                                    <td className="td-amount" style={{ fontWeight: 700 }}>
                                        <div>KES {fmt(a.amount)}</div>
                                        {a.status === 'pending' && (
                                            <div style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>
                                                {a.amount > ((a.totalSavings * 3) - a.activeDebt) ? (
                                                    <span style={{ color: 'var(--danger)' }}>⚠️ Exceeds 3x Limit</span>
                                                ) : (
                                                    <span style={{ color: 'var(--success)' }}>✓ Within Limit</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="td-muted">{a.tenure} months</td>
                                    <td style={{ maxWidth: 200, fontSize: '0.82rem' }} className="td-muted">{a.reason || '—'}</td>
                                    <td className="td-muted">{new Date(a.timestamp).toLocaleDateString('en-GB')}</td>
                                    <td>
                                        <span className={`badge badge-${a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'warning'}`} style={{ textTransform: 'capitalize' }}>
                                            {a.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                                            {a.status === 'pending' && (
                                                <button className="btn btn-primary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setResolve(a)}>Review</button>
                                            )}
                                            
                                            {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                                <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => deleteApplicationRequest(a.id)} title="Delete">🗑</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Resolve Modal */}
            {resolve && (
                <div className="modal-overlay" onClick={() => setResolve(null)}>
                    <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Review Application #{resolve.id}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setResolve(null)}>✕</button>
                        </div>
                        
                        {/* Policy Context Card */}
                        <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Member</span>
                                <span style={{ fontWeight: 800 }}>{resolve.memberName}</span>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Total Savings</div>
                                    <div style={{ fontWeight: 700 }}>KES {fmt(resolve.totalSavings)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Active Debt</div>
                                    <div style={{ fontWeight: 700, color: resolve.activeDebt > 0 ? 'var(--warning)' : 'inherit' }}>KES {fmt(resolve.activeDebt)}</div>
                                </div>
                                <div style={{ gridColumn: 'span 2', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Borrowing Limit (3x)</div>
                                            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--accent)' }}>
                                                KES {fmt((resolve.totalSavings * 3) - resolve.activeDebt)}
                                            </div>
                                        </div>
                                        <div>
                                            {resolve.amount > ((resolve.totalSavings * 3) - resolve.activeDebt) ? (
                                                <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>⚠️ Limit Exceeded</span>
                                            ) : (
                                                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>✅ Within Policy</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8, fontSize: '0.85rem' }}>
                            <div>Requested Amount: <b style={{ fontSize: '1.1rem' }}>KES {fmt(resolve.amount)}</b></div>
                            <div>Requested Tenure: <b>{resolve.tenure} months</b></div>
                        </div>

                        <form onSubmit={handleResolve}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Action <span className="required">*</span></label>
                                <select name="status" required>
                                    <option value="approved">✅ Approve Application</option>
                                    <option value="rejected">❌ Reject Application</option>
                                </select>
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Funding Source <span className="required">*</span></label>
                                <select 
                                    name="fundingSource" 
                                    value={selectedFund} 
                                    onChange={(e) => setSelectedFund(e.target.value)} 
                                    required
                                >
                                    <option value="Member Savings">Member Savings (General Pool)</option>
                                    <option value="Welfare Fund">Welfare Fund</option>
                                    <option value="Institutional Reserves">Institutional Reserves (Fines/Fees)</option>
                                </select>
                                {fundLiquidity !== null && (
                                    <div style={{ fontSize: '0.7rem', marginTop: '0.4rem', color: resolve.amount > fundLiquidity ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                                        Available in {selectedFund}: KES {fundLiquidity.toLocaleString()}
                                    </div>
                                )}
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Interest Rate (% p.m.) <span className="required">*</span></label>
                                <input type="number" name="interestRate" step="0.1" defaultValue="0" required />
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Rate will be applied to the new loan record.</span>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label>Reviewer Notes</label>
                                <textarea name="reviewerNotes" rows={3} placeholder="Optional notes for the member..." style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(16,185,129,0.05)', border: '1px dashed var(--success)', borderRadius: 8 }}>
                                <input type="checkbox" name="automateMpesa" id="automateMpesa" style={{ width: 18, height: 18 }} />
                                <label htmlFor="automateMpesa" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: 'var(--success)' }}>
                                    🚀 Automate M-Pesa Disbursement
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

            {/* ── Confirm Delete Modal ── */}
            {confirmDelete && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3>Confirm Deletion</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Are you sure you want to permanently delete this loan application?
                            <br /><br />
                            <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>This action cannot be undone.</span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-danger" onClick={executeDeleteApplication}>Yes, Delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoanApplications;
