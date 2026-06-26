import { useState, useEffect } from 'react';
import { apiFetch, downloadBlob } from '../utils/api';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart 
} from 'recharts';
import { Download, FileText } from 'lucide-react';

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="glass-tooltip">
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color, margin: '0.15rem 0' }}>
                    {p.name}: {fmt(p.value)}
                </p>
            ))}
        </div>
    );
};

const TABS = ['Overview', 'Monthly', 'Weekly', 'Daily', 'Trends', 'Loan Health', 'Forecast', 'Ledger'];

const Reports = () => {
    const [tab,     setTab]     = useState('Overview');
    const [data,    setData]    = useState([]);
    const [months,  setMonths]  = useState(12);
    const [loading, setLoading] = useState(true);
    // Trend state
    const [dailyData,  setDailyData]  = useState([]);
    const [weeklyData, setWeeklyData] = useState([]);
    const [trends,     setTrends]     = useState(null);
    const [trendLoad,  setTrendLoad]  = useState(false);
    // Loan health state
    const [loanHealth, setLoanHealth] = useState(null);
    const [healthLoad, setHealthLoad] = useState(false);
    // Forecast state
    const [forecast,   setForecast]   = useState(null);
    const [forecastLoad, setForecastLoad] = useState(false);
    // Ledger state
    const [ledger,     setLedger]     = useState([]);
    const [ledgerLoad, setLedgerLoad] = useState(false);
    const [govFunds,   setGovFunds]   = useState(null);
    const [selMonth,   setSelMonth]   = useState(new Date().toISOString().substring(0, 7));
    const [monthDetail, setMonthDetail] = useState([]);

    const fetchGovFunds = () => {
        apiFetch('/api/reports/governance-funds')
            .then(r => r.json())
            .then(d => setGovFunds(d))
            .catch(() => {});
    };

    const fetchOverview = () => {
        fetchGovFunds();
        setLoading(true);
        apiFetch(`/api/reports/monthly?months=${months}`)
            .then(r => r.json())
            .then(d => {
                const formatted = (d.months || []).map(row => ({
                    ...row,
                    label: new Date(row.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
                    Credits: Number(row.credits || 0),
                    Debits:  Number(row.debits  || 0),
                    Net:     Number(row.credits || 0) - Number(row.debits || 0)
                }));
                setData(formatted);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const fetchDaily = () => {
        setLoading(true);
        apiFetch(`/api/reports/daily?days=30`)
            .then(r => r.json())
            .then(d => {
                const formatted = (d.daily || []).map(row => ({
                    ...row,
                    label: new Date(row.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                    Credits: Number(row.credits || 0),
                    Debits:  Number(row.debits  || 0),
                    Net:     Number(row.credits || 0) - Number(row.debits || 0)
                }));
                setDailyData(formatted);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const fetchWeekly = () => {
        setLoading(true);
        apiFetch(`/api/reports/weekly?weeks=12`)
            .then(r => r.json())
            .then(d => {
                const formatted = (d.weekly || []).map(row => ({
                    ...row,
                    label: row.week,
                    Credits: Number(row.credits || 0),
                    Debits:  Number(row.debits  || 0),
                    Net:     Number(row.credits || 0) - Number(row.debits || 0)
                }));
                setWeeklyData(formatted);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    const fetchMonthlyDetail = () => {
        setLoading(true);
        // We reuse the monthly endpoint but could also create a specific detail one if needed.
        // For now, let's just fetch all transactions for this month.
        apiFetch(`/api/reports/monthly?months=1&target=${selMonth}`)
            .then(r => r.json())
            .then(d => {
                // Actually, let's just use the current data if it matches selMonth,
                // or fetch from a more specific endpoint if we had one.
                // Since we want ITEMIZED detail in the UI too:
                apiFetch(`/api/reports/ledger?month=${selMonth}`)
                    .then(r => r.json())
                    .then(ld => {
                        setMonthDetail(ld.ledger || []);
                        setLoading(false);
                    });
            })
            .catch(() => setLoading(false));
    };

    const fetchTrends = () => {
        setTrendLoad(true);
        apiFetch(`/api/reports/trends?months=${months}`)
            .then(r => r.json())
            .then(d => { setTrends(d); setTrendLoad(false); })
            .catch(() => setTrendLoad(false));
    };

    const fetchLoanHealth = () => {
        setHealthLoad(true);
        apiFetch('/api/reports/loan-health')
            .then(r => r.json())
            .then(d => { setLoanHealth(d); setHealthLoad(false); })
            .catch(() => setHealthLoad(false));
    };

    const fetchForecast = () => {
        setForecastLoad(true);
        apiFetch('/api/reports/forecast?months=6')
            .then(r => r.json())
            .then(d => { setForecast(d); setForecastLoad(false); })
            .catch(() => setForecastLoad(false));
    };

    const fetchLedger = () => {
        setLedgerLoad(true);
        apiFetch('/api/transactions?limit=200')
            .then(r => r.json())
            .then(d => { setLedger(Array.isArray(d) ? d : (d.transactions || [])); setLedgerLoad(false); })
            .catch(() => setLedgerLoad(false));
    };

    useEffect(() => {
        if (tab === 'Overview')    fetchOverview();
        if (tab === 'Daily')       fetchDaily();
        if (tab === 'Weekly')      fetchWeekly();
        if (tab === 'Monthly')     fetchMonthlyDetail();
        if (tab === 'Trends')      fetchTrends();
        if (tab === 'Loan Health') fetchLoanHealth();
        if (tab === 'Forecast')    fetchForecast();
        if (tab === 'Ledger')      fetchLedger();
    }, [tab, months, selMonth]);

    const activeData = tab === 'Daily' ? dailyData : tab === 'Weekly' ? weeklyData : tab === 'Monthly' ? [{
        Credits: monthDetail.filter(t => t.type === 'credit').reduce((s,t) => s + t.amount, 0),
        Debits: monthDetail.filter(t => t.type === 'debit').reduce((s,t) => s + t.amount, 0)
    }] : data;
    const totalIn    = activeData.reduce((s, r) => s + (r.Credits || 0), 0);
    const totalOut   = activeData.reduce((s, r) => s + (r.Debits || 0), 0);
    const net        = totalIn - totalOut;

    return (
        <div>
            <div className="section-header">
                <h2>📊 Reports & Analytics</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button className="btn btn-ghost" onClick={() => downloadBlob(`/api/reports/annual.pdf?year=${new Date().getFullYear()}`, `annual_report_${new Date().getFullYear()}.pdf`)}>
                        📄 Annual PDF
                    </button>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Period:</label>
                    {[3, 6, 12].map(m => (
                        <button key={m} className={`btn ${months === m ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                            onClick={() => setMonths(m)}>{m}M</button>
                    ))}
                </div>
            </div>

            {/* Tab bar */}
            <div className="card" style={{ marginBottom: '1.25rem', padding: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {TABS.map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}>{t}</button>
                    ))}
                </div>
            </div>

            {/* ── Overview Tab ──────────────────────────────── */}
            {tab === 'Overview' && (
                <>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem', gap: '1rem' }}>
                        <div className="stat-card"><div className="label">Total In</div><div className="value" style={{ color: 'var(--success)' }}>KES {totalIn.toLocaleString()}</div></div>
                        <div className="stat-card"><div className="label">Total Out</div><div className="value" style={{ color: 'var(--danger)' }}>KES {totalOut.toLocaleString()}</div></div>
                        <div className="stat-card"><div className="label">Net Movement</div><div className="value" style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>KES {Math.abs(net).toLocaleString()}</div></div>
                        {govFunds && (
                            <>
                                <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}><div className="label">System Liquidity</div><div className="value">KES {(govFunds.systemLiquidity || 0).toLocaleString()}</div></div>
                                <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}><div className="label">Total Institutional</div><div className="value">KES {((govFunds.registrationFees || 0) + (govFunds.welfareFund || 0) + (govFunds.penaltiesCollected || 0)).toLocaleString()}</div></div>
                                <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}><div className="label">Reg Fees</div><div className="value">KES {(govFunds.registrationFees || 0).toLocaleString()}</div></div>
                                <div className="stat-card" style={{ borderLeft: '4px solid #f43f5e' }}><div className="label">Welfare Fund</div><div className="value">KES {(govFunds.welfareFund || 0).toLocaleString()}</div></div>
                                <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}><div className="label">Penalties</div><div className="value">KES {(govFunds.penaltiesCollected || 0).toLocaleString()}</div></div>
                            </>
                        )}
                    </div>
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1.25rem' }}>Credits vs Debits — Last {months} Months</h3>
                        {loading ? (
                            <div style={{ height: 300, display: 'flex', alignItems: 'flex-end', gap: '1rem', padding: '1rem' }}>
                                {Array(12).fill(0).map((_, i) => (
                                    <div key={i} style={{ flex: 1, display: 'flex', gap: '4px', alignItems: 'flex-end', height: '100%' }}>
                                        <div className="skeleton-box" style={{ width: '45%', height: `${20 + Math.random() * 60}%`, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}></div>
                                        <div className="skeleton-box" style={{ width: '45%', height: `${10 + Math.random() * 40}%`, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: 0.6 }}></div>
                                    </div>
                                ))}
                            </div>
                        ) :
                        data.length === 0 ? <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '3rem' }}>No data.</p> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '1rem' }} />
                                    <Bar dataKey="Credits" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={1500} animationEasing="ease-in-out" />
                                    <Bar dataKey="Debits"  fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={1500} animationEasing="ease-in-out" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    <div className="card">
                        <h3>Month-by-Month Breakdown</h3>
                        <div className="table-wrap">
                            <table>
                                <thead><tr><th>Month</th><th>Total In</th><th>Total Out</th><th>Net</th></tr></thead>
                                <tbody>
                                    {loading ? (
                                        Array(5).fill(0).map((_, i) => (
                                            <tr key={i} className="skeleton-row">
                                                <td><div className="skeleton-box skeleton-text medium"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short" style={{ fontWeight: 600 }}></div></td>
                                            </tr>
                                        ))
                                    ) :
                                    data.length === 0 ? <tr className="empty-row"><td colSpan="4">No data.</td></tr> :
                                    [...data].reverse().map((r, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600 }}>{r.label}</td>
                                            <td className="td-amount">+ {(r.Credits || 0).toLocaleString()}</td>
                                            <td className="td-debit">− {(r.Debits || 0).toLocaleString()}</td>
                                            <td style={{ color: r.Net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                {r.Net >= 0 ? '+' : '−'} {Math.abs(r.Net || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Monthly Tab ───────────────────────────────── */}
            {tab === 'Monthly' && (
                <>
                    <div className="card shadow-sm" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <label style={{ fontWeight: 600 }}>Select Month:</label>
                                <input type="month" className="input" value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto' }} />
                            </div>
                            <button className="btn btn-primary" onClick={() => downloadBlob(`/api/reports/monthly.pdf?month=${selMonth}`, `monthly_report_${selMonth}.pdf`)}>
                                <Download size={16} style={{ marginRight: '0.5rem' }} /> Export Monthly PDF
                            </button>
                        </div>
                    </div>

                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem', gap: '1rem' }}>
                        <div className="stat-card"><div className="label">Total Inflow</div><div className="value" style={{ color: 'var(--success)' }}>{fmt(totalIn)}</div></div>
                        <div className="stat-card"><div className="label">Total Outflow</div><div className="value" style={{ color: 'var(--danger)' }}>{fmt(totalOut)}</div></div>
                        <div className="stat-card"><div className="label">Monthly Net</div><div className="value" style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(net)}</div></div>
                    </div>

                    <div className="card">
                        <h3>Itemized Transaction Ledger — {new Date(selMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h3>
                        <div className="table-wrap" style={{ marginTop: '1rem' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date / Time</th>
                                        <th>Description</th>
                                        <th>Type</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        Array(5).fill(0).map((_, i) => <tr key={i} className="skeleton-row"><td colSpan="4"><div className="skeleton-box" style={{ height: 20 }}></div></td></tr>)
                                    ) : monthDetail.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>No transactions found for this month.</td></tr>
                                    ) : (
                                        monthDetail.map((t, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{new Date(t.timestamp).toLocaleDateString('en-GB')}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>{t.description}</div>
                                                    {t.reference && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Ref: {t.reference}</div>}
                                                </td>
                                                <td>
                                                    <span className={`badge ${t.type === 'credit' || t.type === 'PERSONAL' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                                                        {t.type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: t.type === 'credit' || t.type === 'PERSONAL' ? 'var(--success)' : 'var(--danger)' }}>
                                                    {t.type === 'credit' || t.type === 'PERSONAL' ? '+' : '−'} {fmt(t.amount)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Daily Tab ──────────────────────────────── */}
            {tab === 'Daily' && (
                <>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                        <div className="stat-card"><div className="label">Total In (30d)</div><div className="value" style={{ color: 'var(--success)' }}>KES {dailyData.reduce((s,r)=>s+(r.Credits || 0), 0).toLocaleString()}</div></div>
                        <div className="stat-card"><div className="label">Total Out (30d)</div><div className="value" style={{ color: 'var(--danger)' }}>KES {dailyData.reduce((s,r)=>s+(r.Debits || 0), 0).toLocaleString()}</div></div>
                        <div className="stat-card"><div className="label">Net (30d)</div><div className="value" style={{ color: (dailyData.reduce((s,r)=>s+(r.Credits || 0), 0)-dailyData.reduce((s,r)=>s+(r.Debits || 0), 0)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>KES {Math.abs(dailyData.reduce((s,r)=>s+(r.Credits || 0), 0)-dailyData.reduce((s,r)=>s+(r.Debits || 0), 0)).toLocaleString()}</div></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button className="btn btn-primary" style={{ padding: '0.4rem 1rem' }} onClick={() => downloadBlob('/api/reports/daily.pdf', `daily_report_${new Date().toISOString().split('T')[0]}.pdf`)}>
                            <Download size={16} /> <span>Download Daily PDF</span>
                        </button>
                    </div>
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1.25rem' }}>Credits vs Debits — Last 30 Days</h3>
                        {loading ? (
                            <div style={{ height: 300, display: 'flex', alignItems: 'flex-end', gap: '4px', padding: '1rem' }}>
                                {Array(30).fill(0).map((_, i) => (
                                    <div key={i} style={{ flex: 1, display: 'flex', gap: '2px', alignItems: 'flex-end', height: '100%' }}>
                                        <div className="skeleton-box" style={{ width: '45%', height: `${10 + Math.random() * 80}%`, borderTopLeftRadius: 2, borderTopRightRadius: 2 }}></div>
                                        <div className="skeleton-box" style={{ width: '45%', height: `${5 + Math.random() * 30}%`, borderTopLeftRadius: 2, borderTopRightRadius: 2, opacity: 0.6 }}></div>
                                    </div>
                                ))}
                            </div>
                        ) :
                        dailyData.length === 0 ? <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '3rem' }}>No data.</p> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={dailyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '1rem' }} />
                                    <Bar dataKey="Credits" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={30} animationDuration={1500} animationEasing="ease-in-out" />
                                    <Bar dataKey="Debits"  fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={30} animationDuration={1500} animationEasing="ease-in-out" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    <div className="card">
                        <h3>Daily Breakdown</h3>
                        <div className="table-wrap">
                            <table>
                                <thead><tr><th>Day</th><th>Total In</th><th>Total Out</th><th>Net</th></tr></thead>
                                <tbody>
                                    {loading ? (
                                        Array(5).fill(0).map((_, i) => (
                                            <tr key={i} className="skeleton-row">
                                                <td><div className="skeleton-box skeleton-text medium"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                            </tr>
                                        ))
                                    ) :
                                    dailyData.length === 0 ? <tr className="empty-row"><td colSpan="4">No data.</td></tr> :
                                    [...dailyData].reverse().map((r, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600 }}>{r.label}</td>
                                            <td className="td-amount">+ {(r.Credits || 0).toLocaleString()}</td>
                                            <td className="td-debit">− {(r.Debits || 0).toLocaleString()}</td>
                                            <td style={{ color: r.Net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                {r.Net >= 0 ? '+' : '−'} {Math.abs(r.Net || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Weekly Tab ──────────────────────────────── */}
            {tab === 'Weekly' && (
                <>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                        <div className="stat-card"><div className="label">Total In (12w)</div><div className="value" style={{ color: 'var(--success)' }}>KES {weeklyData.reduce((s,r)=>s+(r.Credits || 0), 0).toLocaleString()}</div></div>
                        <div className="stat-card"><div className="label">Total Out (12w)</div><div className="value" style={{ color: 'var(--danger)' }}>KES {weeklyData.reduce((s,r)=>s+(r.Debits || 0), 0).toLocaleString()}</div></div>
                        <div className="stat-card"><div className="label">Net (12w)</div><div className="value" style={{ color: (weeklyData.reduce((s,r)=>s+(r.Credits || 0), 0)-weeklyData.reduce((s,r)=>s+(r.Debits || 0), 0)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>KES {Math.abs(weeklyData.reduce((s,r)=>s+(r.Credits || 0), 0)-weeklyData.reduce((s,r)=>s+(r.Debits || 0), 0)).toLocaleString()}</div></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button className="btn btn-primary" style={{ padding: '0.4rem 1rem' }} onClick={() => downloadBlob('/api/reports/weekly.pdf', `weekly_report_${new Date().toISOString().split('T')[0]}.pdf`)}>
                            <Download size={16} /> <span>Download Weekly PDF</span>
                        </button>
                    </div>
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1.25rem' }}>Credits vs Debits — Last 12 Weeks</h3>
                        {loading ? (
                            <div style={{ height: 300, display: 'flex', alignItems: 'flex-end', gap: '1rem', padding: '1rem' }}>
                                {Array(12).fill(0).map((_, i) => (
                                    <div key={i} style={{ flex: 1, display: 'flex', gap: '4px', alignItems: 'flex-end', height: '100%' }}>
                                        <div className="skeleton-box" style={{ width: '45%', height: `${20 + Math.random() * 60}%`, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}></div>
                                        <div className="skeleton-box" style={{ width: '45%', height: `${10 + Math.random() * 40}%`, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: 0.6 }}></div>
                                    </div>
                                ))}
                            </div>
                        ) :
                        weeklyData.length === 0 ? <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '3rem' }}>No data.</p> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '1rem' }} />
                                    <Bar dataKey="Credits" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={1500} animationEasing="ease-in-out" />
                                    <Bar dataKey="Debits"  fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={1500} animationEasing="ease-in-out" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                    <div className="card">
                        <h3>Weekly Breakdown</h3>
                        <div className="table-wrap">
                            <table>
                                <thead><tr><th>Week</th><th>Total In</th><th>Total Out</th><th>Net</th></tr></thead>
                                <tbody>
                                    {loading ? (
                                        Array(5).fill(0).map((_, i) => (
                                            <tr key={i} className="skeleton-row">
                                                <td><div className="skeleton-box skeleton-text medium"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                            </tr>
                                        ))
                                    ) :
                                    weeklyData.length === 0 ? <tr className="empty-row"><td colSpan="4">No data.</td></tr> :
                                    [...weeklyData].reverse().map((r, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 600 }}>{r.label}</td>
                                            <td className="td-amount">+ {(r.Credits || 0).toLocaleString()}</td>
                                            <td className="td-debit">− {(r.Debits || 0).toLocaleString()}</td>
                                            <td style={{ color: r.Net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                {r.Net >= 0 ? '+' : '−'} {Math.abs(r.Net || 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Trends Tab ──────────────────────────────── */}
            {tab === 'Trends' && (
                trendLoad ? (
                    <div style={{ display: 'grid', gap: '1.25rem' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="card" style={{ height: 250 }}>
                                <div className="skeleton-box" style={{ width: '40%', height: '20px', marginBottom: '1.5rem' }}></div>
                                <div style={{ height: 'calc(100% - 40px)', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                    {Array(10).fill(0).map((_, j) => (
                                        <div key={j} className="skeleton-box" style={{ flex: 1, height: `${20 + Math.random() * 60}%`, opacity: 0.3 + (j * 0.05) }}></div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : !trends ? <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Unable to load.</p></div> : (
                    <div style={{ display: 'grid', gap: '1.25rem' }}>
                        {/* Contribution trend */}
                        <div className="card">
                            <h3 style={{ marginBottom: '1rem' }}>💰 Contribution Trend</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <AreaChart data={trends.contributions.map(c => ({ month: c.month.substring(5), total: c.total }))} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: '#888', fontSize: 11 }} />
                                    <Tooltip formatter={v => [fmt(v), 'Contributions']} wrapperClassName="glass-tooltip" contentStyle={{ background: 'transparent', border: 'none' }} />
                                    <Area type="monotone" dataKey="total" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={2} animationDuration={1500} animationEasing="ease-in-out" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Expense trend */}
                        <div className="card">
                            <h3 style={{ marginBottom: '1rem' }}>📉 Expense Trend</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <AreaChart data={trends.expenses.map(c => ({ month: c.month.substring(5), total: c.total }))} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: '#888', fontSize: 11 }} />
                                    <Tooltip formatter={v => [fmt(v), 'Expenses']} wrapperClassName="glass-tooltip" contentStyle={{ background: 'transparent', border: 'none' }} />
                                    <Area type="monotone" dataKey="total" fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth={2} animationDuration={1500} animationEasing="ease-in-out" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Member growth */}
                        <div className="card">
                            <h3 style={{ marginBottom: '1rem' }}>👥 Member Growth</h3>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={trends.memberGrowth.map(c => ({ month: c.month.substring(5), count: c.count }))} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
                                    <YAxis allowDecimals={false} tick={{ fill: '#888', fontSize: 11 }} />
                                    <Tooltip wrapperClassName="glass-tooltip" contentStyle={{ background: 'transparent', border: 'none' }} />
                                    <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={35} animationDuration={1500} animationEasing="ease-in-out" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )
            )}

            {/* ── Loan Health Tab ──────────────────────────── */}
            {tab === 'Loan Health' && (
                healthLoad ? (
                    <>
                        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
                            {Array(4).fill(0).map((_, i) => (
                                <div key={i} className="stat-card">
                                    <div className="skeleton-box" style={{ width: '60%', height: '12px', marginBottom: '0.5rem' }}></div>
                                    <div className="skeleton-box" style={{ width: '40%', height: '24px' }}></div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            <div className="card" style={{ height: 260 }}>
                                <div className="skeleton-box" style={{ width: '40%', height: '20px', marginBottom: '1rem' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <div className="skeleton-box" style={{ width: 140, height: 140, borderRadius: '50%' }}></div>
                                </div>
                            </div>
                            <div className="card" style={{ height: 260 }}>
                                <div className="skeleton-box" style={{ width: '40%', height: '20px', marginBottom: '1.5rem' }}></div>
                                {Array(5).fill(0).map((_, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <div className="skeleton-box" style={{ width: '50%', height: '12px' }}></div>
                                        <div className="skeleton-box" style={{ width: '30%', height: '12px' }}></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : !loanHealth ? <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Unable to load.</p></div> : (
                    <>
                        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
                            {[
                                { label: 'Total Loans', value: loanHealth.total, accent: 'var(--accent)' },
                                { label: 'Active', value: loanHealth.active, accent: '#3b82f6' },
                                { label: 'PAR (Risk)', value: `${loanHealth.par}%`, accent: loanHealth.par > 20 ? 'var(--danger)' : loanHealth.par > 10 ? '#f59e0b' : 'var(--success)' },
                                { label: 'Collection Rate', value: `${loanHealth.collectionRate}%`, accent: loanHealth.collectionRate >= 80 ? 'var(--success)' : '#f59e0b' },
                            ].map(c => (
                                <div key={c.label} className="stat-card" style={{ borderColor: c.accent }}>
                                    <div className="label">{c.label}</div>
                                    <div className="value" style={{ color: c.accent }}>{c.value}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            {/* Pie chart */}
                            <div className="card">
                                <h3 style={{ marginBottom: '1rem' }}>Portfolio Composition</h3>
                                {loanHealth.total === 0 ? <p style={{ color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>No loans yet.</p> : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <Pie data={[
                                                { name: 'Active', value: loanHealth.active },
                                                { name: 'Repaid', value: loanHealth.repaid },
                                                { name: 'Defaulted', value: loanHealth.defaulted },
                                            ].filter(d => d.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent*100).toFixed(0)}%)`}>
                                                {[0,1,2].map((_, i) => <Cell key={i} fill={['#3b82f6','#22c55e','#ef4444'][i]} />)}
                                            </Pie>
                                            <Tooltip wrapperClassName="glass-tooltip" contentStyle={{ background: 'transparent', border: 'none' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            {/* Key metrics */}
                            <div className="card">
                                <h3 style={{ marginBottom: '1rem' }}>Key Metrics</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {[
                                        { label: 'Total Disbursed', value: fmt(loanHealth.totalDisbursed), color: 'var(--accent)' },
                                        { label: 'Outstanding Balance', value: fmt(loanHealth.totalOutstanding), color: 'var(--danger)' },
                                        { label: 'Arrears Amount', value: fmt(loanHealth.arrearsAmount), color: '#f59e0b' },
                                        { label: 'Overdue Loans', value: loanHealth.overdueCount.toString(), color: 'var(--danger)' },
                                        { label: 'Repaid Amount', value: fmt(loanHealth.repaidAmount), color: 'var(--success)' },
                                    ].map(m => (
                                        <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{m.label}</span>
                                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: m.color }}>{m.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )
            )}

            {/* ── Forecast Tab ──────────────────────────────── */}
            {tab === 'Forecast' && (
                forecastLoad ? (
                    <>
                        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                            {Array(3).fill(0).map((_, i) => (
                                <div key={i} className="stat-card">
                                    <div className="skeleton-box" style={{ width: '60%', height: '12px', marginBottom: '0.5rem' }}></div>
                                    <div className="skeleton-box" style={{ width: '40%', height: '24px' }}></div>
                                </div>
                            ))}
                        </div>
                        <div className="card" style={{ height: 320, marginBottom: '1.5rem' }}>
                            <div className="skeleton-box" style={{ width: '40%', height: '20px', marginBottom: '1.5rem' }}></div>
                            <div style={{ height: 'calc(100% - 60px)', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                {Array(12).fill(0).map((_, j) => (
                                    <div key={j} className="skeleton-box" style={{ flex: 1, height: `${30 + Math.random() * 50}%`, opacity: 0.2 }}></div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : !forecast ? <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Unable to load.</p></div> : (
                    <>
                        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                            {[
                                { label: 'Active Members', value: forecast.activeMembers, accent: 'var(--accent)' },
                                { label: 'Expected Monthly Income', value: fmt(forecast.monthlyTarget), accent: 'var(--success)' },
                                { label: 'Avg Monthly Expenses', value: fmt(forecast.avgMonthlyExpenses), accent: 'var(--danger)' },
                            ].map(c => (
                                <div key={c.label} className="stat-card" style={{ borderColor: c.accent }}>
                                    <div className="label">{c.label}</div>
                                    <div className="value" style={{ color: c.accent }}>{c.value}</div>
                                </div>
                            ))}
                        </div>
                        <div className="card" style={{ marginBottom: '1.25rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}>6-Month Cash Flow Projection</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={forecast.forecast.map(f => ({ ...f, month: f.month.substring(5) }))} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: '#888', fontSize: 11 }} />
                                    <Tooltip formatter={v => [fmt(v), '']} wrapperClassName="glass-tooltip" contentStyle={{ background: 'transparent', border: 'none' }} />
                                    <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                                    <Line type="monotone" dataKey="expectedIncome" name="Income" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" animationDuration={1500} animationEasing="ease-in-out" />
                                    <Line type="monotone" dataKey="expectedExpenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" animationDuration={1500} animationEasing="ease-in-out" />
                                    <Line type="monotone" dataKey="netCashFlow" name="Net Cash Flow" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 5 }} animationDuration={1500} animationEasing="ease-in-out" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="card">
                            <h3>Projection Table</h3>
                            <div className="table-wrap">
                                <table>
                                    <thead><tr><th>Month</th><th>Expected Income</th><th>Expected Expenses</th><th>Net Cash Flow</th></tr></thead>
                                    <tbody>
                                        {forecast.forecast.map((f, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 600 }}>{new Date(f.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</td>
                                                <td className="td-amount">{fmt(f.expectedIncome)}</td>
                                                <td className="td-debit">{fmt(f.expectedExpenses)}</td>
                                                <td style={{ color: f.netCashFlow >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                    {fmt(f.netCashFlow)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )
            )}
            {/* ── Ledger Tab ───────────────────────────────── */}
            {tab === 'Ledger' && (
                <>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <h3 style={{ flex: 1, margin: 0 }}>📒 Treasury Ledger</h3>
                        <button className="btn btn-ghost" onClick={() => downloadBlob('/api/export/transactions.csv', `treasury_ledger_${new Date().toISOString().split('T')[0]}.csv`)}>
                            <Download size={16} /> Export CSV
                        </button>
                        <button className="btn btn-primary" onClick={() => downloadBlob('/api/export/transactions.pdf', `treasury_ledger_${new Date().toISOString().split('T')[0]}.pdf`)}>
                            <FileText size={16} /> Download PDF Report
                        </button>
                    </div>

                    {ledgerLoad ? (
                        <div className="card" style={{ padding: 0 }}>
                            <div className="table-wrap">
                                <table>
                                    <thead><tr><th>Type</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th>Performed By</th><th style={{ textAlign: 'right' }}>Date</th></tr></thead>
                                    <tbody>
                                        {Array(8).fill(0).map((_, i) => (
                                            <tr key={i} className="skeleton-row">
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text medium"></div></td>
                                                <td style={{ textAlign: 'right' }}><div className="skeleton-box skeleton-text short"></div></td>
                                                <td><div className="skeleton-box skeleton-text short"></div></td>
                                                <td style={{ textAlign: 'right' }}><div className="skeleton-box skeleton-text short"></div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{ padding: 0 }}>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Description</th>
                                            <th style={{ textAlign: 'right' }}>Amount (KES)</th>
                                            <th>Performed By</th>
                                            <th style={{ textAlign: 'right' }}>Date & Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledger.length === 0 ? (
                                            <tr className="empty-row"><td colSpan="5" style={{ textAlign: 'center', padding: '3rem' }}>No ledger entries found.</td></tr>
                                        ) : ledger.map((t, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 4,
                                                        background: t.type === 'credit' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                        color: t.type === 'credit' ? '#22c55e' : '#ef4444'
                                                    }}>
                                                        {t.type === 'credit' ? '▲ IN' : '▼ OUT'}
                                                    </span>
                                                </td>
                                                <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: t.type === 'credit' ? '#22c55e' : '#ef4444' }}>
                                                    {t.type === 'credit' ? '+' : '−'} {Number(t.amount || 0).toLocaleString()}
                                                </td>
                                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.performed_by || '—'}</td>
                                                <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                                    {t.timestamp ? new Date(t.timestamp).toLocaleString('en-GB') : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Reports;
