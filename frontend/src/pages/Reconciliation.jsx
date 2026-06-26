import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { useNavigate } from 'react-router-dom';

const Reconciliation = () => {
    const navigate = useNavigate();
    const [file,     setFile]     = useState(null);
    const [results,  setResults]  = useState([]);
    const [members,  setMembers]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [toast,    setToast]    = useState(null);
    const [step,     setStep]     = useState(1); // 1: Upload, 2: Review, 3: Success

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        apiFetch('/api/members').then(r => r.json()).then(d => setMembers(d.members || []));
    }, []);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;
        setLoading(true);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await apiFetch('/api/reconcile/upload', { method: 'POST', body: fd, headers: {} });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResults(data.results.map(r => ({ ...r, walletType: 'SACCO Savings', selected: !!r.matchedMemberId })));
            setStep(2);
        } catch (err) { showToast(err.message, 'error'); }
        setLoading(false);
    };

    const handleConfirm = async () => {
        const selected = results.filter(r => r.selected && r.matchedMemberId);
        if (selected.length === 0) return showToast('No payments selected.', 'error');
        
        setLoading(true);
        try {
            const res = await apiFetch('/api/reconcile/confirm', { 
                method: 'POST', 
                body: JSON.stringify({ rows: selected.map(r => ({
                    ref: r.ref, amount: r.amount, date: r.date, memberId: r.matchedMemberId, walletType: r.walletType
                }))})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`Successfully processed ${data.count} payments!`);
            setStep(3);
        } catch (err) { showToast(err.message, 'error'); }
        setLoading(false);
    };

    const updateRow = (index, key, val) => {
        const next = [...results];
        next[index][key] = val;
        if (key === 'matchedMemberId') {
            const m = members.find(m => m.id == val);
            next[index].suggestedMemberName = m ? m.name : '';
            next[index].selected = !!val;
        }
        setResults(next);
    };

    if (step === 1) return (
        <div className="animate-in">
            <div className="section-header">
                <div>
                    <h1>📥 M-Pesa Reconciliation</h1>
                    <p className="sub">Upload your M-Pesa statement to automatically match payments to members.</p>
                </div>
            </div>
            <div className="card" style={{ maxWidth: 600, margin: '2rem auto', textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <h3>Upload Statement</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Supports CSV exports from M-Pesa Business/Paybill portals.</p>
                <form onSubmit={handleUpload}>
                    <input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])} style={{ marginBottom: '1.5rem' }} />
                    <br />
                    <button type="submit" className="btn btn-primary" disabled={!file || loading}>
                        {loading ? 'Processing...' : 'Analyze Statement'}
                    </button>
                </form>
            </div>
        </div>
    );

    if (step === 2) return (
        <div className="animate-in">
            <div className="section-header">
                <div>
                    <h1>Review Matches</h1>
                    <p className="sub">We've attempted to match {results.length} transactions by phone or name.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={() => setStep(1)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
                        {loading ? 'Saving...' : `Record ${results.filter(r => r.selected).length} Payments`}
                    </button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            <div className="card p-0 overflow-hidden">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th>M-Pesa Transaction</th>
                                <th>Amount</th>
                                <th>Detected Member</th>
                                <th>Target Wallet</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => (
                                <tr key={r.ref} className={r.selected ? '' : 'text-muted'}>
                                    <td>
                                        <input type="checkbox" checked={r.selected} onChange={e => updateRow(i, 'selected', e.target.checked)} />
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 700 }}>{r.ref}</div>
                                        <div style={{ fontSize: '0.75rem' }}>{r.details}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{r.date}</div>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>KES {r.amount.toLocaleString()}</td>
                                    <td>
                                        <select 
                                            value={r.matchedMemberId || ''} 
                                            onChange={e => updateRow(i, 'matchedMemberId', e.target.value)}
                                            style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                                        >
                                            <option value="">-- No Match Found --</option>
                                            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                        {r.matchType !== 'none' && (
                                            <div style={{ fontSize: '0.65rem', color: 'var(--success)', marginTop: '0.2rem' }}>
                                                ✓ Matched by {r.matchType}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <select 
                                            value={r.walletType} 
                                            onChange={e => updateRow(i, 'walletType', e.target.value)}
                                            style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                                        >
                                            <option value="SACCO Savings">SACCO Savings</option>
                                            <option value="Personal Savings">Personal Savings</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    if (step === 3) return (
        <div className="animate-in" style={{ textAlign: 'center', padding: '5rem 1rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
            <h1>Reconciliation Complete!</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>All selected payments have been added to the member ledgers and due dates updated.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => navigate('/payments')}>View Payments</button>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Import Another</button>
            </div>
        </div>
    );
};

export default Reconciliation;
