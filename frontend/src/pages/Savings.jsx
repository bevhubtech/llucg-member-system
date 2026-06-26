import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer
} from 'recharts';
import { 
    TrendingUp, Users as UsersIcon, Wallet, Activity, ArrowUpDown, 
    Search, Download, RefreshCw, FileText, PiggyBank, Briefcase
} from 'lucide-react';

const fmt = n => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Savings = () => {
    const [data,    setData]    = useState([]);
    const [trends,  setTrends]  = useState([]);
    const [stats, setStats] = useState({ 
        totalGroupBalance: 0, 
        totalInterestEarned: 0, 
        fundBreakdown: { savings: 0, welfare: 0, reserves: 0, personal: 0 } 
    });
    const [loading, setLoading] = useState(true);
    const [search,  setSearch]  = useState('');
    const [toast,   setToast]   = useState(null);
    const [sort,    setSort]    = useState({ key: 'name', dir: 'asc' });
    const [showDividend, setShowDividend] = useState(false);
    const [dividendForm, setDividendForm] = useState({ totalProfit: '', periodLabel: new Date().getFullYear().toString(), notes: '' });
    const [dividendResult, setDividendResult] = useState(null);
    const [declaringDividend, setDeclaringDividend] = useState(false);
    const [sysFeatures, setSysFeatures] = useState({});

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [summaryRes, trendsRes, sysRes] = await Promise.all([
                apiFetch('/api/reports/savings-summary'),
                apiFetch('/api/reports/trends?months=6'),
                apiFetch('/api/system/status')
            ]);
            
            if (!summaryRes.ok) throw new Error(`Savings Summary Error: ${summaryRes.status}`);
            if (!trendsRes.ok) throw new Error(`Trends Sync Error: ${trendsRes.status}`);
            
            const summary = await summaryRes.json();
            const trendsData = await trendsRes.json();
            const sysData = sysRes.ok ? await sysRes.json() : {};

            setData(summary.members || []);
            setStats({
                totalGroupBalance: summary.totalGroupBalance || 0,
                totalInterestEarned: summary.totalInterestEarned || 0,
                fundBreakdown: summary.fundBreakdown || { savings: 0, welfare: 0, reserves: 0, personal: 0 }
            });
            setTrends(trendsData.contributions || []);
            setSysFeatures(sysData.features || {});
        } catch (err) {
            console.error('Savings Sync Error:', err);
            showToast(err.message || 'Failed to sync financial data.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAllData(); }, []);

    const navigate = useNavigate();

    // --- Logic & Sorting ---

    const handleSort = (key) => {
        setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    };

    const filteredAndSorted = useMemo(() => {
        let docs = data.filter(m => 
            (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
            (m.phone || '').includes(search)
        );

        return docs.sort((a, b) => {
            let v1 = a[sort.key], v2 = b[sort.key];
            if (sort.key === 'overall') {
                v1 = (a.saccoTotal + a.personalTotal);
                v2 = (b.saccoTotal + b.personalTotal);
            }
            if (v1 < v2) return sort.dir === 'asc' ? -1 : 1;
            if (v1 > v2) return sort.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, search, sort]);

    // --- Actions ---

    const handleDeclareDividend = async (e) => {
        e.preventDefault();
        if (!window.confirm(`Declare KES ${Number(dividendForm.totalProfit).toLocaleString()} in dividends to all active members? This action cannot be undone.`)) return;
        setDeclaringDividend(true);
        try {
            const res = await apiFetch('/api/finance/dividends/declare', {
                method: 'POST',
                body: JSON.stringify(dividendForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setDividendResult(data);
            showToast(`✅ KES ${data.totalDistributed?.toLocaleString()} distributed to ${data.distributions?.length} members!`);
            fetchAllData();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setDeclaringDividend(false);
        }
    };


    const exportCSV = () => {
        const headers = ['Membership ID', 'Member Name', 'Phone', 'SACCO Savings (KES)', 'Personal Savings (KES)', 'Total Managed (KES)', 'Last Updated'];
        const csvRows = [
            headers.join(','),
            ...filteredAndSorted.map(m => [
                m.id,
                `"${m.name}"`,
                `"${m.phone}"`,
                m.saccoTotal,
                m.personalTotal,
                (m.saccoTotal + m.personalTotal),
                m.lastPaymentDate ? new Date(m.lastPaymentDate).toLocaleDateString('en-GB') : 'N/A'
            ].join(','))
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `LLUCG_Savings_Report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const downloadSummaryPdf = async () => {
        try {
            showToast('Generating group summary PDF...', 'info');
            const res = await apiFetch('/api/reports/savings-summary.pdf');
            if (!res.ok) throw new Error('PDF Generation Failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Savings_Summary_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            a.click();
            showToast('Summary PDF ready.');
        } catch (e) {
            showToast('Failed to generate summary PDF.', 'error');
        }
    };

    const downloadPDF = async (memberId, name) => {
        try {
            const res = await apiFetch(`/api/reports/member/${memberId}/savings.pdf`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Savings_Statement_${name.replace(/\s+/g,'_')}.pdf`;
            a.click();
            showToast('PDF Document generated.');
        } catch (e) {
            showToast('Failed to generate statement.', 'error');
        }
    };

    return (
        <div className="animate-in pb-20">
            {/* Header Area */}
            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <PiggyBank className="text-accent" size={32} /> Savings Analytics
                    </h1>
                    <p className="sub text-secondary">Advanced tracking and liquidity analysis for group portfolios.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={() => navigate('/member-lifecycle')} style={{ border: '1px solid var(--accent-dim)', color: 'var(--accent)' }}>
                        <Activity size={18} /> Member Lifecycle Intelligence
                    </button>
                    <button className="btn btn-ghost" onClick={fetchAllData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Syncing...' : 'Sync Data'}
                    </button>
                    <button className="btn btn-ghost" onClick={downloadSummaryPdf} disabled={data.length === 0}>
                        <FileText size={16} /> Export PDF
                    </button>
                    <button className="btn btn-primary" onClick={exportCSV} disabled={data.length === 0}>
                        <Download size={16} /> Export Intelligence
                    </button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ zIndex: 1000 }}>{toast.msg}</div>}

            {/* Quick Insights Row */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <div className="stat-label">Total Managed Capital</div>
                    <div className="stat-value text-accent">KES {fmt(stats.totalGroupBalance)}</div>
                    <div className="stat-desc">Full group liquidity (incl. reserves)</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <div className="stat-label">Member Savings Fund</div>
                    <div className="stat-value" style={{ color: '#3b82f6' }}>KES {fmt(stats.fundBreakdown?.savings)}</div>
                    <div className="stat-desc">Primary capital for lending</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <div className="stat-label">Welfare Fund</div>
                    <div className="stat-value" style={{ color: '#10b981' }}>KES {fmt(stats.fundBreakdown?.welfare)}</div>
                    <div className="stat-desc">Dedicated welfare pool</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                    <div className="stat-label">Institutional Reserves</div>
                    <div className="stat-value" style={{ color: '#8b5cf6' }}>KES {fmt(stats.fundBreakdown?.reserves)}</div>
                    <div className="stat-desc">Fines/Penalties/Reg Fees/Group owned</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div className="stat-label">Total Interest Earned</div>
                    <div className="stat-value" style={{ color: '#f59e0b' }}>KES {fmt(stats.totalInterestEarned)}</div>
                    <div className="stat-desc">Growth from lending profit</div>
                </div>
            </div>

            {/* Visual Analytics Section */}
            <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
                <div className="card col-2" style={{ height: 320 }}>
                    <div className="card-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <h3 style={{ fontSize: '1rem' }}>Contribution Growth (6 Months)</h3>
                        <div className="badge badge-accent">Trend Analysis</div>
                    </div>
                    <div style={{ width: '100%', height: 'calc(100% - 60px)' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trends}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `KES ${val >= 1000 ? (val/1000)+'k' : val}`} />
                                <ReTooltip 
                                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--text-primary)' }}
                                />
                                <Area type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="card" style={{ height: 320, background: 'var(--surface)' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem' }}>Portfolio Architecture</h3>
                    <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                        <div style={{ marginBottom: '1.75rem' }}>
                            <div className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>
                                {Math.round((stats.individualTotal / stats.total) * 100) || 0}%
                            </div>
                            <div className="stat-label">Privately Owned</div>
                        </div>
                        <div style={{ height: 10, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', marginBottom: '1.5rem' }}>
                            <div style={{ width: `${(stats.sacco / stats.total) * 100}%`, background: 'var(--accent)' }} title="Sacco Shares" />
                            <div style={{ width: `${(stats.personal / stats.total) * 100}%`, background: 'var(--success)' }} title="Personal Savings" />
                            <div style={{ width: `${(stats.reserves / stats.total) * 100}%`, background: '#d97706' }} title="Institutional Reserves" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'left', fontSize: '0.7rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} /> SACCO</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} /> Personal</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} /> Reserves</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)' }} /> Other</div>
                        </div>
                    </div>
                </div>
            </div>


            {/* Individual Tracking */}
            <div className="card shadow-sm" style={{ padding: 0 }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="search-box" style={{ maxWidth: 350, flexGrow: 1 }}>
                        <Search size={16} className="text-secondary" />
                        <input 
                            type="text" 
                            placeholder="Lookup by member name or phone..." 
                            value={search} 
                            onChange={e => setSearch(e.target.value)} 
                        />
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
                        Showing {filteredAndSorted.length} Intelligence Rows
                    </div>
                </div>

                <div className="table-wrap">
                    <table className="pro-table">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('name')} className="sortable">
                                    Member Insights <ArrowUpDown size={12} style={{ opacity: 0.5, marginLeft: 4 }} />
                                </th>
                                <th onClick={() => handleSort('saccoTotal')} className="sortable text-right">
                                    SACCO Shares <ArrowUpDown size={12} style={{ opacity: 0.5, marginLeft: 4 }} />
                                </th>
                                <th onClick={() => handleSort('personalTotal')} className="sortable text-right">
                                    Personal Savings <ArrowUpDown size={12} style={{ opacity: 0.5, marginLeft: 4 }} />
                                </th>
                                <th onClick={() => handleSort('overall')} className="sortable text-right">
                                    Overall Wealth <ArrowUpDown size={12} style={{ opacity: 0.5, marginLeft: 4 }} />
                                </th>
                                <th className="text-center">Activity</th>
                                <th className="text-right">Intelligence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="skeleton-row">
                                        <td><div className="skeleton-box skeleton-text medium"></div><div className="skeleton-box skeleton-text short" style={{ marginTop: '0.25rem' }}></div></td>
                                        <td className="text-right"><div className="skeleton-box skeleton-text short"></div></td>
                                        <td className="text-right"><div className="skeleton-box skeleton-text short"></div></td>
                                        <td className="text-right"><div className="skeleton-box skeleton-text medium"></div></td>
                                        <td className="text-center"><div className="skeleton-box skeleton-text short"></div></td>
                                        <td className="text-right"><div className="skeleton-box skeleton-text short"></div></td>
                                    </tr>
                                ))
                            ) : filteredAndSorted.length === 0 ? (
                                <tr className="empty-row text-center"><td colSpan="6" style={{ padding: '4rem 0' }}>No financial matches found for "{search}"</td></tr>
                            ) : (
                                filteredAndSorted.map(m => (
                                    <tr key={m.id} className="hover-row">
                                        <td>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.phone}</div>
                                        </td>
                                        <td className="text-right" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {Number(m.saccoTotal).toLocaleString()}
                                        </td>
                                        <td className="text-right" style={{ fontWeight: 600, color: 'var(--success)' }}>
                                            {Number(m.personalTotal).toLocaleString()}
                                        </td>
                                        <td className="text-right">
                                            <span style={{ 
                                                fontWeight: 800, 
                                                fontSize: '0.9rem',
                                                padding: '0.2rem 0.5rem',
                                                background: 'var(--accent-dim)',
                                                color: 'var(--accent)',
                                                borderRadius: '6px'
                                            }}>
                                                KES {(m.saccoTotal + m.personalTotal).toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="text-center" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {m.lastPaymentDate ? new Date(m.lastPaymentDate).toLocaleDateString('en-GB') : '—'}
                                        </td>
                                        <td className="text-right">
                                            <button 
                                                className="btn btn-ghost btn-sm btn-icon" 
                                                onClick={() => downloadPDF(m.id, m.name)}
                                                title="Generate Branded PDF Analysis"
                                            >
                                                <FileText size={18} />
                                            </button>
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

export default Savings;
