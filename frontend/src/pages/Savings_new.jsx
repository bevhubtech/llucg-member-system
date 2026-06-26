import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer
} from 'recharts';
import { 
    TrendingUp, Users as UsersIcon, Wallet, Activity, ArrowUpDown, 
    Search, Download, RefreshCw, FileText, PiggyBank, Briefcase
} from 'lucide-react';

const Savings = () => {
    const [data,    setData]    = useState([]);
    const [trends,  setTrends]  = useState([]);
    const [loading, setLoading] = useState(true);
    const [search,  setSearch]  = useState('');
    const [toast,   setToast]   = useState(null);
    const [sort,    setSort]    = useState({ key: 'name', dir: 'asc' });

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [summaryRes, trendsRes] = await Promise.all([
                apiFetch('/api/reports/savings-summary'),
                apiFetch('/api/reports/trends?months=6')
            ]);
            const summary = await summaryRes.json();
            const trendsData = await trendsRes.json();

            setData(summary.members || []);
            setTrends(trendsData.contributions || []);
        } catch (err) {
            showToast('Failed to sync financial data.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAllData(); }, []);

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

    const stats = useMemo(() => {
        const sacco = filteredAndSorted.reduce((s, m) => s + (m.saccoTotal || 0), 0);
        const personal = filteredAndSorted.reduce((s, m) => s + (m.personalTotal || 0), 0);
        const active = filteredAndSorted.filter(m => (m.saccoTotal + m.personalTotal) > 0).length;
        return { sacco, personal, total: sacco + personal, active };
    }, [filteredAndSorted]);

    // --- Actions ---

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
                    <button className="btn btn-ghost" onClick={fetchAllData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Syncing...' : 'Sync Data'}
                    </button>
                    <button className="btn btn-primary" onClick={exportCSV} disabled={data.length === 0}>
                        <Download size={16} /> Export Intelligence
                    </button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ zIndex: 1000 }}>{toast.msg}</div>}

            {/* Quick Insights Row */}
            <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Wallet size={20} /></div>
                    <div className="stat-label">Total Group Capital</div>
                    <div className="stat-value text-accent">KES {stats.total.toLocaleString()}</div>
                    <div className="stat-desc">Aggregated member wealth</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}><TrendingUp size={20} /></div>
                    <div className="stat-label">Personal Savings</div>
                    <div className="stat-value text-success">KES {stats.personal.toLocaleString()}</div>
                    <div className="stat-desc">Withdrawable liquidity</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}><Briefcase size={20} /></div>
                    <div className="stat-label">SACCO Shares</div>
                    <div className="stat-value text-warning">KES {stats.sacco.toLocaleString()}</div>
                    <div className="stat-desc">Locked equity capital</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--info)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--info)' }}><UsersIcon size={20} /></div>
                    <div className="stat-label">Active Savers</div>
                    <div className="stat-value text-info">{stats.active} Members</div>
                    <div className="stat-desc">Participation rate active</div>
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
                                    contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                    itemStyle={{ color: 'var(--text-primary)' }}
                                />
                                <Area type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="card" style={{ height: 320, background: 'var(--card-bg)' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>Portfolio Mix</h3>
                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        <div style={{ marginBottom: '2rem' }}>
                            <div className="stat-value" style={{ color: 'var(--accent)', fontSize: '1.5rem' }}>
                                {Math.round((stats.sacco / stats.total) * 100) || 0}%
                            </div>
                            <div className="stat-label">In SACCO Shares</div>
                        </div>
                        <div style={{ height: 8, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex' }}>
                            <div style={{ width: `${(stats.sacco / stats.total) * 100}%`, background: 'var(--accent)' }} />
                            <div style={{ width: `${(stats.personal / stats.total) * 100}%`, background: 'var(--success)' }} />
                        </div>
                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} /> SACCO
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)' }} /> Personal
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Data Table */}
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
                                    Member Insights {sort.key === 'name' && (sort.dir === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('saccoTotal')} className="sortable text-right">
                                    SACCO Shares {sort.key === 'saccoTotal' && (sort.dir === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('personalTotal')} className="sortable text-right">
                                    Personal Savings {sort.key === 'personalTotal' && (sort.dir === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('overall')} className="sortable text-right">
                                    Financial Net {sort.key === 'overall' && (sort.dir === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-center">Last Activity</th>
                                <th className="text-right">Intelligence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="skeleton-row"><td colSpan="6" style={{ height: 60 }}></td></tr>
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
                                                fontSize: '0.95rem',
                                                padding: '0.2rem 0.5rem',
                                                background: 'var(--accent-dim)',
                                                color: 'var(--accent)',
                                                borderRadius: '6px'
                                            }}>
                                                KES {(m.saccoTotal + m.personalTotal).toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="text-center" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {m.lastPaymentDate ? new Date(m.lastPaymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
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
