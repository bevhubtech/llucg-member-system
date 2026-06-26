import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getRole, downloadBlob } from '../utils/api';

const fmt = n => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusBadge = (s) => {
    const map = { active: ['#6366f1', 'Active'], repaid: ['#10b981', 'Repaid'], defaulted: ['#ef4444', 'Defaulted'] };
    const [color, label] = map[s] || ['#888', s];
    return <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 20, background: `${color}15`, color, border: `1px solid ${color}30` }}>{label}</span>;
};

// ── Loan Modal ───────────────────────────────────────────────
const LoanModal = ({ members, onClose, onSaved }) => {
    const today = new Date().toISOString().split('T')[0];
    const in30  = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    const [form, setForm] = useState({ memberId: '', amount: '', interestRate: 0, disbursedDate: today, dueDate: in30, notes: '', tenure: 1, repaymentMethod: 'flat', guarantorId: '', guaranteedAmt: '', fundingSource: 'Member Savings' });
    const [fundLiquidity, setFundLiquidity] = useState(null);
    const [err,  setErr]  = useState('');
    const [busy, setBusy] = useState(false);
    const h = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const updateTenure = (months) => {
        const dd = new Date(form.disbursedDate || today);
        dd.setMonth(dd.getMonth() + parseInt(months || 1));
        setForm(f => ({ ...f, tenure: parseInt(months || 1), dueDate: dd.toISOString().split('T')[0] }));
    };

    useEffect(() => {
        const source = form.fundingSource || 'Member Savings';
        apiFetch(`/api/reports/savings-summary`).then(r => r.json()).then(d => {
            // This is a simplified fetch; in reality we want a specific endpoint or summary
            // But for now we can use the summary which we updated to include liquidity
            setFundLiquidity(d.totalGroupBalance || 0); 
            // Note: In a real production app, I'd make a specific /api/stats/liquidity?fund=... endpoint
        });
    }, [form.fundingSource]);

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const body = { 
                ...form, 
                amount: parseFloat(form.amount || 0), 
                interestRate: parseFloat(form.interestRate || 0), 
                tenure: parseInt(form.tenure || 1),
                guarantors: form.guarantorId ? [{ memberId: form.guarantorId, amount: parseFloat(form.guaranteedAmt || 0) }] : []
            };
            const r = await apiFetch('/api/loans', { method: 'POST', body: JSON.stringify(body) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSaved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>💰 Issue New Loan</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                {err && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}
                <form onSubmit={submit}>
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Borrowing Member <span className="required">*</span></label>
                            <select name="memberId" value={form.memberId} onChange={h} required>
                                <option value="">Select member…</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.phone}</option>)}
                            </select>
                        </div>
                        <div className="form-group"><label>Principal (KES) <span className="required">*</span></label><input type="number" name="amount" step="1" min="0" value={form.amount} onChange={h} required placeholder="e.g. 10000" /></div>
                        <div className="form-group"><label>Interest Rate (%)</label><input type="number" name="interestRate" min="0" step="0.1" value={form.interestRate} onChange={h} placeholder="0" /></div>
                        
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Funding Source <span className="required">*</span></label>
                            <select name="fundingSource" value={form.fundingSource} onChange={h} required>
                                <option value="Member Savings">Member Savings (General Pool)</option>
                                <option value="Welfare Fund">Welfare Fund</option>
                                <option value="Institutional Reserves">Institutional Reserves (Fines/Fees)</option>
                            </select>
                            {fundLiquidity !== null && (
                                <div style={{ fontSize: '0.7rem', marginTop: '0.4rem', color: form.amount > fundLiquidity ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                                    Available in {form.fundingSource}: KES {fundLiquidity.toLocaleString()}
                                </div>
                            )}
                        </div>
                        
                        <div className="form-group" style={{ gridColumn: '1/-1', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>PRIMARY GUARANTOR (OPTIONAL)</div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                                    <select name="guarantorId" value={form.guarantorId} onChange={h}>
                                        <option value="">No initial guarantor…</option>
                                        {members.filter(m => m.id !== parseInt(form.memberId)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <input type="number" name="guaranteedAmt" step="1" value={form.guaranteedAmt} onChange={h} placeholder="Amt" disabled={!form.guarantorId} required={!!form.guarantorId} />
                                </div>
                            </div>
                        </div>

                        <div className="form-group"><label>Tenure (months) <span className="required">*</span></label><input type="number" name="tenure" min="1" max="60" value={form.tenure} onChange={e => updateTenure(e.target.value)} required /></div>
                        <div className="form-group"><label>Repayment Method</label><select name="repaymentMethod" value={form.repaymentMethod} onChange={h}><option value="flat">Flat</option><option value="reducing">Reducing</option></select></div>
                        <div className="form-group"><label>Disbursed Date <span className="required">*</span></label><input type="date" name="disbursedDate" value={form.disbursedDate} onChange={h} required /></div>
                        <div className="form-group"><label>Due Date <span className="required">*</span></label><input type="date" name="dueDate" value={form.dueDate} onChange={h} required /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : '+ Issue Loan'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Repay Modal ──────────────────────────────────────────────
const RepayModal = ({ loan, onClose, onSaved }) => {
    const today = new Date().toISOString().split('T')[0];
    const [form, setForm] = useState({ amount: loan.balance, paidDate: today, reference: '' });
    const [err,  setErr]  = useState('');
    const [busy, setBusy] = useState(false);
    const h = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await apiFetch(`/api/loans/${loan.id}/repay`, { method: 'POST', body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSaved(`Repayment recorded. Balance: KES ${fmt(d.newBalance)}`);
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>💳 Record Repayment</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                <p style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>Loan #{loan.id} — Outstanding: <b style={{ color: 'var(--danger)' }}>KES {fmt(loan.balance)}</b></p>
                {err && <div className="toast toast-error">{err}</div>}
                <form onSubmit={submit}>
                    <div className="form-grid">
                        <div className="form-group"><label>Amount</label><input type="number" name="amount" step="1" min="0" max={loan.balance} value={form.amount} onChange={h} required /></div>
                        <div className="form-group"><label>Date</label><input type="date" name="paidDate" value={form.paidDate} onChange={h} required /></div>
                        <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Reference</label><input name="reference" value={form.reference} onChange={h} placeholder="e.g. M-Pesa" /></div>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} disabled={busy}>{busy ? 'Processing…' : 'Record Repayment'}</button>
                </form>
            </div>
        </div>
    );
};

// ── Schedule Modal ───────────────────────────────────────────
const ScheduleModal = ({ loan, onClose }) => {
    const [data, setData] = useState(null);
    useEffect(() => {
        apiFetch(`/api/loans/${loan.id}/schedule`).then(r => r.json()).then(setData);
    }, [loan.id]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 600 }}>
                <div className="modal-header"><h3>📋 Amortization Schedule</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                {!data ? <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div> : (
                    <div className="table-wrap" style={{ maxHeight: 400 }}>
                        <table>
                            <thead><tr><th>#</th><th>Due Date</th><th>Payment</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
                            <tbody>{data.schedule.map(s => (<tr key={s.installment}><td>{s.installment}</td><td>{new Date(s.dueDate).toLocaleDateString()}</td><td>{fmt(s.payment)}</td><td>{fmt(s.principal)}</td><td>{fmt(s.interest)}</td><td>{fmt(s.balance)}</td></tr>))}</tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Repayment History Modal ──────────────────────────────────
const HistoryModal = ({ loan, onClose }) => {
    const [data, setData] = useState(null);
    useEffect(() => {
        apiFetch(`/api/loans/${loan.id}/repayments`).then(r => r.json()).then(setData);
    }, [loan.id]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 640 }}>
                <div className="modal-header"><h3>🕒 Repayment History — #{loan.id}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                {!data ? <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div> : (
                    <div className="table-wrap" style={{ maxHeight: 400 }}>
                        <table>
                            <thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                            <tbody>
                                {data.repayments.length === 0 ? <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No repayments recorded yet.</td></tr> : data.repayments.map(r => (
                                    <tr key={r.id}>
                                        <td>{new Date(r.paidDate).toLocaleDateString()}</td>
                                        <td>{r.reference || '—'}</td>
                                        <td style={{ fontWeight: 700, color: 'var(--success)' }}>KES {fmt(r.amount)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-ghost btn-icon" title="Download Receipt" onClick={() => downloadBlob(`/api/loan-repayments/${r.id}/receipt.pdf`, `Receipt_${r.reference || r.id}.pdf`)}>📄</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Loans Page ──────────────────────────────────────────
const Loans = () => {
    const [loans,   setLoans]   = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter,  setFilter]  = useState('all');
    const [search,  setSearch]  = useState('');
    const [sortField, setSortField] = useState('disbursedDate');
    const [sortOrder, setSortOrder] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage] = useState(15);
    const [modal, setModal] = useState(null);
    const [repay, setRepay] = useState(null);
    const [schedule, setSchedule] = useState(null);
    const [history, setHistory] = useState(null);
    const [toast, setToast] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            apiFetch('/api/loans').then(r => r.json()),
            apiFetch('/api/members').then(r => r.json()),
        ]).then(([l, m]) => {
            setLoans(l.loans || []);
            setMembers((m.members || []).filter(m => m.status === 'active'));
            setLoading(false);
        });
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const filtered = loans.filter(l => {
        if (filter !== 'all' && l.status !== filter) return false;
        if (search && !(l.memberName?.toLowerCase().includes(search.toLowerCase()) || l.membershipNumber?.toLowerCase().includes(search.toLowerCase()))) return false;
        return true;
    }).sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
    const totalPages = Math.ceil(filtered.length / perPage);

    const toggleSort = (f) => {
        if (sortField === f) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortField(f); setSortOrder('asc'); }
    };

    return (
        <div>
            <div className="section-header">
                <h2>💰 Loan Management</h2>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={() => downloadBlob('/api/reports/loans-portfolio.pdf', 'Loans_Report.pdf')}>📄 Export PDF</button>
                    <button className="btn btn-primary" onClick={() => setModal(true)}>+ New Loan</button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <input style={{ flex: 1, minWidth: 250 }} placeholder="🔍 Search member or number…" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {['all', 'active', 'repaid', 'defaulted'].map(s => (
                            <button key={s} className={`btn ${filter === s ? 'btn-primary' : 'btn-ghost'}`} style={{ textTransform: 'capitalize' }} onClick={() => { setFilter(s); setCurrentPage(1); }}>{s}</button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th onClick={() => toggleSort('memberName')} style={{ cursor: 'pointer' }}>Member {sortField==='memberName'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th onClick={() => toggleSort('amount')} style={{ cursor: 'pointer' }}>Principal {sortField==='amount'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th>Interest</th>
                                <th onClick={() => toggleSort('disbursedDate')} style={{ cursor: 'pointer' }}>Disbursed {sortField==='disbursedDate'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th onClick={() => toggleSort('balance')} style={{ cursor: 'pointer' }}>Remaining Balance {sortField==='balance'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th>Source</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="skeleton-row">
                                        <td><div className="skeleton-box skeleton-text medium"></div><div className="skeleton-box skeleton-text short" style={{ marginTop: '0.25rem' }}></div></td>
                                        <td><div className="skeleton-box skeleton-text short"></div></td>
                                        <td><div className="skeleton-box skeleton-text short"></div></td>
                                        <td><div className="skeleton-box skeleton-text short"></div></td>
                                        <td><div className="skeleton-box skeleton-text short"></div></td>
                                        <td><div className="skeleton-box skeleton-text short"></div></td>
                                        <td style={{ textAlign: 'center' }}><div className="skeleton-box skeleton-text short"></div></td>
                                    </tr>
                                ))
                            ) : paginated.length === 0 ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>No loans found matching your criteria.</td></tr> : paginated.map(l => (
                                <tr key={l.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{l.memberName}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{l.membershipNumber}</div>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>KES {fmt(l.originalPrincipal || l.amount)}</td>
                                    <td style={{ color: '#f59e0b', fontSize: '0.82rem' }}>{l.interestRate}% ({fmt(l.totalInterest)})</td>
                                    <td className="td-muted">{new Date(l.disbursedDate).toLocaleDateString('en-GB')}</td>
                                    <td style={{ color: l.status === 'repaid' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                        KES {fmt(l.amount - (l.totalRepaid || 0))}
                                    </td>
                                    <td><span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{l.fundingSource || 'Member Savings'}</span></td>
                                    <td>{statusBadge(l.status)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                            {l.status === 'repaid' ? (
                                                <button className="btn btn-ghost" style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', color: 'var(--success)', border: '1px solid var(--success)', cursor: 'default' }} disabled>✅ Settled</button>
                                            ) : (
                                                <button className="btn btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }} onClick={() => setRepay(l)}>💸 Repay</button>
                                            )}
                                            <button className="btn btn-ghost btn-icon" title="History" onClick={() => setHistory(l)}>🕒</button>
                                            <button className="btn btn-ghost btn-icon" title="Schedule" onClick={() => setSchedule(l)}>📋</button>
                                            <button className="btn btn-ghost btn-icon" title="Loan Receipt" onClick={() => downloadBlob(`/api/loans/${l.id}/receipt.pdf`, `Loan_${l.id}_Receipt.pdf`)}>📄</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="pagination" style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                        <button className="btn btn-ghost" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
                        <span style={{ fontSize: '0.85rem' }}>Page {currentPage} of {totalPages}</span>
                        <button className="btn btn-ghost" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
                    </div>
                )}
            </div>

            {modal && <LoanModal members={members} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); showToast('Loan issued successfully.'); }} />}
            {repay && <RepayModal loan={repay} onClose={() => setRepay(null)} onSaved={(m) => { setRepay(null); load(); showToast(m); }} />}
            {schedule && <ScheduleModal loan={schedule} onClose={() => setSchedule(null)} />}
            {history && <HistoryModal loan={history} onClose={() => setHistory(null)} />}
        </div>
    );
};

export default Loans;
