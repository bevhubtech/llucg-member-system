import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getRole, downloadBlob } from '../utils/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Briefcase, MapPin, Building2, Landmark, PiggyBank, Package, Plus, Edit3, Trash2, Activity, ArrowUpRight, ArrowDownRight, XCircle, Download, FileText, ShieldCheck, AlertTriangle, Zap, ExternalLink } from 'lucide-react';

const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n)   => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
const fmtCompact = (n) => {
    const v = Number(n || 0);
    if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v/1000).toFixed(0)}K`;
    return v.toFixed(0);
};

const TYPE_ICONS = {
    'Land': MapPin,
    'Stocks': TrendingUp,
    'Business': Building2,
    'Fixed Deposit': Landmark,
    'Other': Package
};

const TYPE_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

// ── Valuation History Chart Component ───────────────────────────
const PerformanceChart = ({ data }) => {
    if (!data || data.length === 0) return (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 8, color: 'var(--text-dim)', fontSize: '0.8rem', border: '1px dashed var(--border)' }}>
            No valuation history available.
        </div>
    );
    return (
        <div style={{ height: 200, width: '100%', marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" fontSize={9} tickFormatter={d => new Date(d).toLocaleDateString('en-GB', { month: 'short' })} stroke="var(--text-dim)" />
                    <YAxis fontSize={9} stroke="var(--text-dim)" tickFormatter={v => `${fmtCompact(v)}`} />
                    <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem', boxShadow: 'var(--shadow-md)', color: 'var(--text-primary)' }}
                        formatter={(val) => [fmtMoney(val), 'Value']}
                        labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" fillOpacity={1} fill="url(#colorVal)" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

// ── Valuation Modal ────────────────────────────────────────────
const ValuationModal = ({ investment, onClose, onSaved }) => {
    const today = new Date().toISOString().split('T')[0];
    const [form, setForm] = useState({ value: investment.currentValue, valuationDate: today });
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState('');
    const [history, setHistory] = useState([]);

    useEffect(() => {
        apiFetch(`/api/investments/${investment.id}/history`).then(r => r.json()).then(d => setHistory(d.history || []));
    }, [investment.id]);

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await apiFetch(`/api/investments/${investment.id}/valuation`, { 
                method: 'POST', body: JSON.stringify({ ...form, value: parseFloat(form.value) }) 
            });
            if (!r.ok) throw new Error((await r.json()).error);
            onSaved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    const chartData = [...history.map(h => ({ date: h.valuationDate, value: h.value })), { date: today, value: parseFloat(form.value) }];
    const gain = investment.currentValue - investment.amountInvested;
    const roi = investment.amountInvested > 0 ? ((gain / investment.amountInvested) * 100).toFixed(1) : 0;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Activity size={18} color="var(--accent)" /> Asset Performance Dashboard
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}><XCircle size={20} /></button>
                </div>

                {/* Asset Summary Header */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-body)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>Asset</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{investment.name}</div>
                        <span className="badge-light" style={{ marginTop: '0.25rem', display: 'inline-block' }}>{investment.type}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Current ROI</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: gain >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                            {gain >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                            {roi >= 0 ? '+' : ''}{roi}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: gain >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {gain >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(gain))}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div>
                        <h4 style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Update Market Valuation</h4>
                        {err && <div className="toast toast-error">{err}</div>}
                        <form onSubmit={submit}>
                            <div className="form-group">
                                <label>New Market Value (KES) <span className="required">*</span></label>
                                <input type="number" value={form.value} onChange={e => setForm({...form, value: e.target.value})} required />
                            </div>
                            <div className="form-group">
                                <label>Valuation Date <span className="required">*</span></label>
                                <input type="date" value={form.valuationDate} onChange={e => setForm({...form, valuationDate: e.target.value})} required />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Processing…' : '✓ Record Value'}</button>
                                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                            </div>
                        </form>
                    </div>
                    <div>
                        <h4 style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.2rem', letterSpacing: '0.05em' }}>Valuation Trend</h4>
                        <PerformanceChart data={chartData} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const Investments = () => {
    const [stats, setStats] = useState({ 
        totalInvested: 0, currentTotal: 0, profit: 0, roi: 0, byType: [], topAsset: null, 
        counts: { total: 0, active: 0, liquidated: 0 },
        risk: { hhi: 0, status: 'Healthy' },
        benchmarks: { targetYield: 12, performance: 'Trailing' },
        payouts: { totalDividends: 0 }
    });
    const [items, setItems] = useState([]);
    const [totalHistory, setTotalHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [valuing, setValuing] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [toast, setToast] = useState(null);
    const [filterType, setFilterType] = useState('all');
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('purchaseDate');
    const [sortOrder, setSortOrder] = useState('desc');

    const emptyForm = { name: '', type: 'Land', amountInvested: '', currentValue: '', purchaseDate: new Date().toISOString().split('T')[0], status: 'active', notes: '' };
    const [form, setForm] = useState(emptyForm);

    const showMsg = (msg, type = 'success') => { setToast({msg, type}); setTimeout(() => setToast(null), 3000); };

    const fetchAll = useCallback(() => {
        setLoading(true);
        apiFetch('/api/investments').then(r => r.json()).then(d => { setItems(d.investments || []); setLoading(false); }).catch(() => setLoading(false));
        apiFetch('/api/investments/stats').then(r => r.json()).then(d => setStats(s => ({ ...s, ...d }))).catch(() => {});
        apiFetch('/api/investments/history/total').then(r => r.json()).then(d => setTotalHistory(d.history || [])).catch(() => {});
    }, []);
    useEffect(fetchAll, [fetchAll]);

    const executeDelete = async () => {
        const id = confirmDelete;
        setConfirmDelete(null);
        if (!id) return;
        try {
            await apiFetch(`/api/investments/${id}`, { method: 'DELETE' });
            showMsg('Asset permanently removed from portfolio.');
            fetchAll();
        } catch (err) { showMsg(err.message, 'error'); }
    };

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });
    const handleSave = async (e) => {
        e.preventDefault();
        const method = editing ? 'PUT' : 'POST';
        const url = editing ? `/api/investments/${editing.id}` : '/api/investments';
        try {
            const res = await apiFetch(url, { method, body: JSON.stringify(form) });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg(`Investment ${editing ? 'updated' : 'registered'} successfully.`);
            setShowForm(false); setEditing(null); setForm(emptyForm); fetchAll();
        } catch (err) { showMsg(err.message, 'error'); }
    };

    const filteredItems = items.filter(i => {
        const matchesType = filterType === 'all' || i.type === filterType;
        const matchesSearch = i.name?.toLowerCase().includes(search.toLowerCase()) || i.notes?.toLowerCase().includes(search.toLowerCase());
        return matchesType && matchesSearch;
    }).sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const toggleSort = (f) => {
        if (sortField === f) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortField(f); setSortOrder('asc'); }
    };
    const uniqueTypes = [...new Set(items.map(i => i.type))];

    return (
        <div className="animate-in">
            <div className="section-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Briefcase size={24} color="var(--accent)" /> Portfolio Intelligence
                    </h1>
                    <p className="sub">Market valuations, diversification analytics, and yield performance benchmarks.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button className="btn btn-ghost" onClick={() => downloadBlob('/api/export/investments.pdf', 'portfolio_report.pdf')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                        <FileText size={14} /> PDF
                    </button>
                    <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={16} /> Register Asset
                    </button>
                </div>
            </div>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            {/* ── Total Portfolio Chart ──────────────── */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card shadow-lg" 
                style={{ 
                    marginBottom: '1.5rem', 
                    padding: '1.5rem', 
                    background: 'var(--grad-indigo-soft)',
                    border: '1px solid var(--accent-border)',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                <div style={{ position: 'absolute', top: 0, right: 0, opacity: 0.03, pointerEvents: 'none' }}>
                    <Activity size={300} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
                            Portfolio Growth Trajectory
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                            <h2 style={{ fontSize: '2.4rem', fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>{fmtMoney(stats.currentTotal)}</h2>
                            <div style={{ color: stats.roi >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                {stats.roi >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                {stats.roi}% Total Yield
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>DIVERSIFICATION SCORE</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: stats.risk?.status === 'Healthy' ? 'var(--success)' : 'var(--warning)', marginBottom: '0.4rem' }}>
                            {stats.risk?.status === 'Healthy' ? 'Optimized' : 'Concentrated'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>ROI VS TARGET</div>
                        <div style={{ width: 100, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', marginLeft: 'auto' }}>
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (stats.roi / stats.benchmarks?.targetYield) * 100)}%` }}
                                style={{ height: '100%', background: stats.roi >= stats.benchmarks?.targetYield ? 'var(--success)' : 'var(--warning)' }}
                            />
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Goal: {stats.benchmarks?.targetYield}%</div>
                    </div>
                </div>

                <div style={{ height: 280, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={totalHistory}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="date" hide />
                            <YAxis hide domain={['dataMin - 50000', 'dataMax + 50000']} />
                            <Tooltip 
                                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }}
                                formatter={(val) => [fmtMoney(val), 'Portfolio Value']}
                                labelFormatter={(d) => fmtDate(d)}
                            />
                            <ReferenceLine y={stats.totalInvested} stroke="var(--text-dim)" strokeDasharray="5 5" label={{ value: 'Cost Basis', position: 'insideBottomLeft', fill: 'var(--text-dim)', fontSize: 10 }} />
                            <Area type="monotone" dataKey="value" stroke="var(--accent)" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ── Summary Cards ─────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <DollarSign size={18} color="var(--accent)" />
                    </div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Capital Deployed</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{fmtMoney(stats.totalInvested)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>{stats.counts?.active || 0} active assets</div>
                </div>
                <div className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', background: stats.profit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BarChart3 size={18} color={stats.profit >= 0 ? 'var(--success)' : 'var(--danger)'} />
                    </div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Portfolio Valuation</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.currentTotal >= stats.totalInvested ? 'var(--success)' : 'var(--danger)' }}>{fmtMoney(stats.currentTotal)}</div>
                    <div style={{ fontSize: '0.7rem', color: stats.profit >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                        {stats.profit >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {fmtMoney(Math.abs(stats.profit))} unrealized {stats.profit >= 0 ? 'gains' : 'losses'}
                    </div>
                </div>
                <div className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', background: stats.roi >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {stats.roi >= 0 ? <TrendingUp size={18} color="var(--success)" /> : <TrendingDown size={18} color="var(--danger)" />}
                    </div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Net Return on Investment</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.roi >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {stats.roi >= 0 ? '+' : ''}{Number(stats.roi).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Yield on deployed capital</div>
                </div>
                <div className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PiggyBank size={18} color="#f59e0b" />
                    </div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Top Performer</div>
                    {stats.topAsset ? (
                        <>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{stats.topAsset.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--success)', marginTop: '0.25rem' }}>+{stats.topAsset.roi}% ROI • {stats.topAsset.type}</div>
                        </>
                    ) : (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>No active assets</div>
                    )}
                </div>
            </div>

            {/* ── Summary Intelligence Cards ─────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <motion.div whileHover={{ scale: 1.02 }} className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--accent)', opacity: 0.1 }}><DollarSign size={40} /></div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Capital Deployed</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{fmtMoney(stats.totalInvested)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <ShieldCheck size={12} color="var(--success)" /> Fully collateralized assets
                    </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }} className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid var(--success)' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--success)', opacity: 0.1 }}><Zap size={40} /></div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Yield Performance</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{stats.roi}%</div>
                    <div style={{ fontSize: '0.7rem', color: stats.benchmarks?.performance === 'Exceeding' ? 'var(--success)' : 'var(--warning)', marginTop: '0.4rem', fontWeight: 600 }}>
                        {stats.benchmarks?.performance === 'Exceeding' ? '✓ Above 12% Annual Target' : `⚡ Tracking @ ${stats.roi}% (Target 12%)`}
                    </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }} className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', borderLeft: `4px solid ${stats.risk?.status === 'Healthy' ? 'var(--success)' : 'var(--warning)'}` }}>
                    {stats.risk?.status === 'Healthy' ? <ShieldCheck size={40} style={{ position: 'absolute', top: 12, right: 12, opacity: 0.1, color: 'var(--success)' }} /> : <AlertTriangle size={40} style={{ position: 'absolute', top: 12, right: 12, opacity: 0.1, color: 'var(--warning)' }} />}
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Diversification Index</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.risk?.hhi} <small style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 400 }}>HHI</small></div>
                    <div style={{ fontSize: '0.7rem', color: stats.risk?.status === 'Healthy' ? 'var(--text-dim)' : 'var(--warning)', marginTop: '0.4rem' }}>
                        {stats.risk?.status === 'Healthy' ? '✓ Portfolio risk is well distributed' : '⚠️ Concentration risk detected'}
                    </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }} className="card shadow-sm" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ position: 'absolute', top: 12, right: 12, color: '#f59e0b', opacity: 0.1 }}><PiggyBank size={40} /></div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Total Dividends Paid</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>{fmtMoney(stats.payouts?.totalDividends)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>Group profit distributions to date</div>
                </motion.div>
            </div>

            {/* ── Allocation Breakdown ─────────────────────────── */}
            {stats.byType && stats.byType.length > 0 && (
                <div className="card shadow-sm" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <BarChart3 size={16} color="var(--accent)" /> Strategic Asset Allocation
                        </h3>
                        {stats.risk?.status !== 'Healthy' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning)', fontSize: '0.7rem', fontWeight: 700, padding: '0.3rem 0.6rem', background: 'rgba(245,158,11,0.1)', borderRadius: 6 }}>
                                <AlertTriangle size={14} /> EXPOSURE WARNING
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                        <div style={{ width: 160, height: 160 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={stats.byType} dataKey="valuation" nameKey="type" cx="50%" cy="50%" outerRadius={70} innerRadius={45}>
                                        {stats.byType.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--text-primary)' }}
                                        formatter={(val) => [fmtMoney(val), 'Valuation']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                            {stats.byType.map((t, i) => {
                                const Icon = TYPE_ICONS[t.type] || Package;
                                const pct = stats.currentTotal > 0 ? ((t.valuation / stats.currentTotal) * 100).toFixed(1) : 0;
                                return (
                                    <div key={t.type} style={{ flex: '1 1 180px', padding: '0.75rem', background: 'var(--bg-body)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                                            <Icon size={14} color="var(--text-dim)" />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{t.type}</span>
                                        </div>
                                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{fmtMoney(t.valuation)}</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{t.count} asset{t.count > 1 ? 's' : ''} • {pct}% of portfolio</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── New/Edit Asset Form ──────────────────────────── */}
            {showForm && (
                <div className="card card-highlight animate-in" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {editing ? <><Edit3 size={18} /> Edit Asset</> : <><Plus size={18} /> Register New Investment</>}
                        </h3>
                        <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><XCircle size={20} /></button>
                    </div>
                    <form onSubmit={handleSave} className="form-grid">
                        <div className="form-group">
                            <label>Asset Name <span className="required">*</span></label>
                            <input name="name" required value={form.name} onChange={handleChange} placeholder="e.g. Ruiru Commercial Plots" />
                        </div>
                        <div className="form-group">
                            <label>Category <span className="required">*</span></label>
                            <select name="type" value={form.type} onChange={handleChange}>
                                <option value="Land">Land / Real Estate</option>
                                <option value="Stocks">Stocks / Bonds</option>
                                <option value="Business">Business Venture</option>
                                <option value="Fixed Deposit">Fixed Deposit</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Initial Capital (KES) <span className="required">*</span></label>
                            <input type="number" name="amountInvested" step="1" required value={form.amountInvested} onChange={handleChange} placeholder="0" disabled={!!editing} />
                        </div>
                        <div className="form-group">
                            <label>Current Valuation (KES) <span className="required">*</span></label>
                            <input type="number" name="currentValue" step="1" required value={form.currentValue} onChange={handleChange} placeholder="0" />
                        </div>
                        <div className="form-group">
                            <label>Acquisition Date <span className="required">*</span></label>
                            <input type="date" name="purchaseDate" required value={form.purchaseDate} onChange={handleChange} disabled={!!editing} />
                        </div>
                        {editing && (
                            <div className="form-group">
                                <label>Status</label>
                                <select name="status" value={form.status} onChange={handleChange}>
                                    <option value="active">Active</option>
                                    <option value="sold">Sold / Liquidated</option>
                                </select>
                            </div>
                        )}
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Notes <small>(optional remarks)</small></label>
                            <input name="notes" value={form.notes || ''} onChange={handleChange} placeholder="e.g. Located along Eastern Bypass, 2 acres" />
                        </div>
                        <div style={{ gridColumn: '1 / -1', marginTop: '0.8rem', display: 'flex', gap: '0.75rem' }}>
                            <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Register'} Asset</button>
                            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Assets Table ─────────────────────────────────── */}
            <div className="card p-0 overflow-hidden shadow-sm">
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Asset Registry</h3>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <input 
                                placeholder="🔍 Search assets…" 
                                value={search} 
                                onChange={e => setSearch(e.target.value)} 
                                style={{ width: 220, fontSize: '0.8rem', padding: '0.35rem 0.75rem' }} 
                            />
                            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-body)', padding: '0.2rem', borderRadius: 8 }}>
                                <button 
                                    className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-ghost'}`} 
                                    style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                                    onClick={() => setFilterType('all')}
                                >All ({items.length})</button>
                                {uniqueTypes.map(t => (
                                    <button 
                                        key={t}
                                        className={`btn ${filterType === t ? 'btn-primary' : 'btn-ghost'}`} 
                                        style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                                        onClick={() => setFilterType(t)}
                                    >{t}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>Asset {sortField==='name'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th>Category</th>
                                <th onClick={() => toggleSort('amountInvested')} style={{ cursor: 'pointer' }}>Capital {sortField==='amountInvested'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th onClick={() => toggleSort('currentValue')} style={{ cursor: 'pointer' }}>Current Value {sortField==='currentValue'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th>ROI</th>
                                <th onClick={() => toggleSort('purchaseDate')} style={{ cursor: 'pointer' }}>Acquired {sortField==='purchaseDate'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <tr><td colSpan="7" style={{textAlign:'center', padding: '3rem', color: 'var(--text-dim)'}}>Analyzing Portfolio...</td></tr> :
                             filteredItems.length === 0 ? (
                                <tr><td colSpan="7" style={{textAlign:'center', padding: '3rem'}}>
                                    <div style={{ color: 'var(--text-dim)' }}>
                                        <Briefcase size={40} opacity={0.15} style={{ marginBottom: '0.75rem' }} />
                                        <p>No assets recorded yet. Click "Register Asset" to add your first investment.</p>
                                    </div>
                                </td></tr>
                             ) : filteredItems.map(i => {
                                 const gain = i.currentValue - i.amountInvested;
                                 const r = i.amountInvested > 0 ? (((i.currentValue - i.amountInvested) / i.amountInvested) * 100).toFixed(1) : '0.0';
                                 const Icon = TYPE_ICONS[i.type] || Package;
                                 return (
                                     <motion.tr 
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: i.status === 'sold' ? 0.5 : 1 }}
                                        key={i.id}
                                     >
                                         <td>
                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                 <strong>{i.name}</strong>
                                                 {i.status === 'sold' && <span className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: '0.6rem', width: 'fit-content', marginTop: '0.2rem' }}>LIQUIDATED</span>}
                                                 {i.notes && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{i.notes}</span>}
                                             </div>
                                         </td>
                                         <td>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                 <Icon size={14} color="var(--text-dim)" />
                                                 <span className="badge-light">{i.type}</span>
                                             </div>
                                         </td>
                                         <td className="td-amount">{fmtMoney(i.amountInvested)}</td>
                                         <td className="td-amount">
                                             <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                 <span style={{ color: gain >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{fmtMoney(i.currentValue)}</span>
                                                 <span style={{ fontSize: '0.65rem', color: gain >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                                                     {gain >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                                     {fmtMoney(Math.abs(gain))}
                                                 </span>
                                             </div>
                                         </td>
                                         <td>
                                             <span style={{ 
                                                 color: r >= 0 ? 'var(--success)' : 'var(--danger)', 
                                                 fontWeight: 700,
                                                 padding: '0.2rem 0.5rem',
                                                 background: r >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                 borderRadius: 6,
                                                 fontSize: '0.8rem'
                                             }}>
                                                 {r >= 0 ? '+' : ''}{r}%
                                             </span>
                                         </td>
                                         <td className="td-muted">{fmtDate(i.purchaseDate)}</td>
                                         <td style={{ textAlign: 'center' }}>
                                             <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                <button className="btn btn-ghost" style={{ padding: '0.35rem 0.6rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} 
                                                    onClick={() => setValuing(i)} title="Update Valuation">
                                                    <Activity size={12} /> Performance
                                                </button>
                                                <button className="btn btn-ghost btn-icon" style={{ padding: '0.35rem' }} 
                                                    onClick={() => { setEditing(i); setForm({...i, notes: i.notes || ''}); setShowForm(true); }} title="Edit">
                                                    <Edit3 size={14} />
                                                </button>
                                                 {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                                     <button className="btn btn-ghost btn-icon" style={{ padding: '0.35rem', color: 'var(--danger)' }} onClick={() => setConfirmDelete(i.id)} title="Delete">
                                                        <Trash2 size={14} />
                                                     </button>
                                                 )}
                                             </div>
                                         </td>
                                     </motion.tr>
                                 );
                             })}
                        </tbody>
                    </table>
                </div>
            </div>

            {valuing && <ValuationModal investment={valuing} onClose={() => setValuing(null)} onSaved={() => { setValuing(null); fetchAll(); showMsg('Valuation history updated.'); }} />}

            {/* ── Confirm Delete Modal ── */}
            {confirmDelete && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}><Trash2 size={18} /> Confirm Deletion</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}><XCircle size={20} /></button>
                        </div>
                        <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5, fontSize: '0.9rem' }}>
                            Are you sure you want to permanently remove this asset from the portfolio?
                        </p>
                        <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0 0 1.5rem' }}>
                            All valuation history records will also be erased. This action is irreversible.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn" style={{ flex: 1, backgroundColor: 'var(--danger)', color: '#fff' }} onClick={executeDelete}>Yes, Delete Asset</button>
                            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default Investments;
