import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';

const SavingsSummary = () => {
    const navigate = useNavigate();
    const [data,    setData]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [search,  setSearch]  = useState('');
    const [toast,   setToast]   = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchSummary = () => {
        setLoading(true);
        apiFetch('/api/reports/savings-summary')
            .then(r => r.json())
            .then(d => { setData(d.members || []); setLoading(false); })
            .catch(() => { showToast('Failed to load savings summary.', 'error'); setLoading(false); });
    };

    useEffect(() => { fetchSummary(); }, []);

    const filtered = data.filter(m => 
        (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.phone || '').includes(search)
    );

    const exportCSV = () => {
        const headers = ['Member Name', 'Phone', 'SACCO Savings (KES)', 'Personal Savings (KES)', 'Total Savings (KES)'];
        const csvRows = [
            headers.join(','),
            ...filtered.map(m => [
                `"${m.name}"`,
                `"${m.phone}"`,
                m.saccoTotal,
                m.personalTotal,
                (m.saccoTotal + m.personalTotal)
            ].join(','))
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `savings_summary_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const totals = filtered.reduce((acc, m) => ({
        sacco: acc.sacco + (m.saccoTotal || 0),
        personal: acc.personal + (m.personalTotal || 0)
    }), { sacco: 0, personal: 0 });

    return (
        <div>
            <div className="section-header">
                <div>
                    <h2>💰 Savings Summary</h2>
                    <p className="sub">Member-level aggregated balances for the Finance team.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={fetchSummary}>↻ Refresh</button>
                    <button className="btn btn-primary" onClick={exportCSV} disabled={data.length === 0}>⬇ Export CSV</button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="search-box" style={{ maxWidth: 350, flexGrow: 1 }}>
                        <span className="search-icon">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Search by name or phone..." 
                            value={search} 
                            onChange={e => setSearch(e.target.value)} 
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Group SACCO Total</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>KES {(totals.sacco || 0).toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Group Personal Total</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>KES {(totals.personal || 0).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Member Name / Phone</th>
                                <th style={{ textAlign: 'right' }}>SACCO Savings (KES)</th>
                                <th style={{ textAlign: 'right' }}>Personal Savings (KES)</th>
                                <th style={{ textAlign: 'right' }}>Total (KES)</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="empty-row"><td colSpan="5">Loading financial data...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr className="empty-row"><td colSpan="5">No members found matching your search.</td></tr>
                            ) : (
                                filtered.map(m => (
                                    <tr key={m.id}>
                                        <td>
                                            <div style={{ fontWeight: 700 }}>{m.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.phone}</div>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                                            {Number(m.saccoTotal).toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>
                                            {Number(m.personalTotal).toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                            {(m.saccoTotal + m.personalTotal).toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/members`)}>View Member</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SavingsSummary;
