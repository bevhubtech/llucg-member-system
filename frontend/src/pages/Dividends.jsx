import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    TrendingUp, Award, Download, Play, 
    History, Search, FileText, ChevronRight,
    Users, DollarSign, Activity, AlertCircle, RefreshCw,
    Receipt, BookOpen, Info
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch, downloadBlob } from '../utils/api';

const BreakdownModal = ({ dividend, onClose }) => {
    const [breakdown, setBreakdown] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        apiFetch(`/api/ict/dividends/${dividend.id}/breakdown`)
            .then(r => r.json())
            .then(d => setBreakdown(d.breakdown || []))
            .catch(e => console.error(e))
            .finally(() => setLoading(false));
    }, [dividend.id]);

    const filtered = breakdown.filter(b => 
        b.memberName.toLowerCase().includes(search.toLowerCase()) || 
        b.membershipNumber?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 800, width: '90%' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 style={{ margin: 0 }}>Distribution Breakdown</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>Cycle Date: {new Date(dividend.distributionDate).toLocaleDateString()} | Pool: KES {Number(dividend.totalPoolAmount).toLocaleString()}</p>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div style={{ padding: '1.5rem' }}>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <div className="search-wrap">
                            <Search size={16} />
                            <input 
                                className="input" 
                                placeholder="Search member by name or ID..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ paddingLeft: '2.5rem' }}
                            />
                        </div>
                    </div>

                    <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Member Name</th>
                                    <th>Membership ID</th>
                                    <th style={{ textAlign: 'right' }}>Allocated Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '3rem' }}>Loading breakdown...</td></tr>
                                ) : filtered.map(b => (
                                    <tr key={b.id}>
                                        <td style={{ fontWeight: 700 }}>{b.memberName}</td>
                                        <td style={{ opacity: 0.7 }}>{b.membershipNumber || 'N/A'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>KES {Number(b.amount).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {!loading && filtered.length === 0 && (
                                    <tr><td colSpan="3" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No records matching search.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

const Dividends = () => {
    const [history, setHistory] = useState([]);
    const [summary, setSummary] = useState({ total: 0, count: 0, avg: 0 });
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [showEngine, setShowEngine] = useState(false);
    const [selectedDiv, setSelectedDiv] = useState(null);
    const [showPolicy, setShowPolicy] = useState(false);
    const [policyContent, setPolicyContent] = useState('');
    const [isEditingPolicy, setIsEditingPolicy] = useState(false);
    const [savingPolicy, setSavingPolicy] = useState(false);
    const [toast, setToast] = useState(null);
    const navigate = useNavigate();

    const fetchPolicy = useCallback(async () => {
        try {
            const r = await apiFetch('/api/ict/dividend-policy');
            const d = await r.json();
            setPolicyContent(d.policy);
        } catch (e) { console.error('Failed to fetch policy:', e); }
    }, []);

    const [form, setForm] = useState({
        poolAmount: '',
        method: 'proportional',
        fundingSource: 'Investment Profits',
        note: ''
    });

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const r = await apiFetch('/api/ict/dividends');
            const d = await r.json();
            const divs = d.dividends || [];
            setHistory(divs);

            const total = divs.reduce((s, x) => s + Number(x.totalPoolAmount), 0);
            setSummary({
                total,
                count: divs.length,
                avg: divs.length > 0 ? Math.round(total / divs.length) : 0
            });
        } catch (e) {
            showToast('Failed to sync dividend data', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { 
        fetchData(); 
        fetchPolicy();
    }, [fetchData, fetchPolicy]);

    const handleSavePolicy = async () => {
        setSavingPolicy(true);
        try {
            const r = await apiFetch('/api/ict/dividend-policy', {
                method: 'PUT',
                body: JSON.stringify({ policy: policyContent })
            });
            if (!r.ok) throw new Error('Save failed');
            showToast('Financial Policy updated successfully.');
            setIsEditingPolicy(false);
        } catch (e) {
            showToast('Failed to update policy.', 'error');
        } finally {
            setSavingPolicy(false);
        }
    };

    const [preview, setPreview] = useState(null);

    const runPreview = async () => {
        if (!form.poolAmount || form.poolAmount <= 0) return showToast('Enter a valid pool amount.', 'error');
        setBusyId('preview');
        try {
            const r = await apiFetch('/api/ict/dividend-engine/preview', {
                method: 'POST',
                body: JSON.stringify(form)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setPreview(data.distributions || []);
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const runEngine = async (e) => {
        if (e) e.preventDefault();
        const confirmMsg = `Ready to distribute prosperity?\n\nYou are about to allocate KES ${Number(form.poolAmount).toLocaleString()} across ${preview?.length || 'all'} active members.\n\nThis will create permanent financial ledger entries and update member balances immediately.\n\nProceed with distribution?`;
        if (!window.confirm(confirmMsg)) return;
        
        setBusyId('engine');
        try {
            const r = await apiFetch('/api/ict/dividend-engine/execute', {
                method: 'POST',
                body: JSON.stringify(form)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            
            showToast('Dividend allocation completed successfully.');
            setForm({ poolAmount: '', method: 'proportional', fundingSource: 'Investment Profits', note: '' });
            setPreview(null);
            setShowEngine(false);
            fetchData();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const chartData = [...history].reverse().map(h => ({
        date: new Date(h.distributionDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
        amount: Number(h.totalPoolAmount)
    }));

    if (loading && history.length === 0) return <div className="loading-state">Syncing Financial Vault...</div>;

    return (
        <div className="page-container" style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
            {toast && <div className={`toast toast-${toast.type}`} style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 1000 }}>{toast.msg}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <TrendingUp size={40} className="text-accent" /> Institutional Dividends
                    </h1>
                    <p style={{ fontSize: '1rem', opacity: 0.6, marginTop: '0.5rem' }}>Automated prosperity distribution & financial audit trail.</p>
                </div>
                <button 
                    className="btn btn-primary" 
                    style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 700, gap: '0.6rem', boxShadow: '0 10px 20px -5px var(--accent-dim)' }}
                    onClick={() => { setShowEngine(!showEngine); setPreview(null); }}
                >
                    <Play size={20} /> {showEngine ? 'Cancel Execution' : 'Run Dividend Engine'}
                </button>
            </div>

            {/* Metrics Header */}
            <div className="grid grid-3" style={{ marginBottom: '2.5rem' }}>
                <div className="card shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0.5rem', borderRadius: '8px' }}><DollarSign size={24} /></div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--success)' }}>LIFETIME</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Distributed</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>KES {summary.total.toLocaleString()}</div>
                </div>
                <div className="card shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ color: 'var(--member-accent)', background: 'var(--member-accent-dim)', padding: '0.5rem', borderRadius: '8px' }}><Users size={24} /></div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>CYCLES</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Execution Count</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>{summary.count} Runs</div>
                </div>
                <div className="card shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0.5rem', borderRadius: '8px' }}><Activity size={24} /></div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>AVERAGE</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Average Per Run</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>KES {summary.avg.toLocaleString()}</div>
                </div>
            </div>

            {showEngine && (
                <div className="card shadow-xl" style={{ marginBottom: '2.5rem', background: 'var(--surface-2)', border: '2px solid var(--accent)', padding: '2rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <AlertCircle className="text-accent" /> Configure Dividend Cycle
                    </h3>
                    <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto', gap: '1.5rem', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'block' }}>TOTAL POOL AMOUNT (KES)</label>
                            <input 
                                className="input" 
                                type="number" 
                                required 
                                value={form.poolAmount} 
                                onChange={e => { setForm({...form, poolAmount: e.target.value}); setPreview(null); }} 
                                placeholder="e.g. 500000"
                                style={{ fontSize: '1.1rem', fontWeight: 700 }}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'block' }}>CALCULATION METHOD</label>
                            <select 
                                className="input" 
                                value={form.method} 
                                onChange={e => { setForm({...form, method: e.target.value}); setPreview(null); }}
                                style={{ fontWeight: 600 }}
                            >
                                <option value="proportional">Proportional to Savings</option>
                                <option value="equal">Equal Distribution</option>
                                <option value="performance">Loyalty-Based Payout</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'block' }}>FUNDING SOURCE</label>
                            <select 
                                className="input" 
                                value={form.fundingSource} 
                                onChange={e => { setForm({...form, fundingSource: e.target.value}); setPreview(null); }}
                                style={{ fontWeight: 600 }}
                            >
                                <option value="Penalties/Fines">Penalties & Fines</option>
                                <option value="Interest from Loans">Interest from Loans</option>
                                <option value="Investment Profits">Investment Profits</option>
                                <option value="Welfare Fund">Welfare Fund Pool</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'block' }}>AUDIT NOTE</label>
                            <input 
                                className="input" 
                                value={form.note} 
                                onChange={e => setForm({...form, note: e.target.value})} 
                                placeholder="e.g. Q1 2024 Surplus Share"
                            />
                        </div>
                        <button className="btn btn-ghost" type="button" onClick={runPreview} style={{ height: '3rem', padding: '0 1.5rem' }} disabled={busyId === 'preview'}>
                            {busyId === 'preview' ? <RefreshCw className="spin" /> : '🔍 Preview'}
                        </button>
                        <button className="btn btn-primary" type="button" onClick={runEngine} style={{ height: '3rem', padding: '0 2rem' }} disabled={busyId === 'engine' || !preview}>
                            {busyId === 'engine' ? <RefreshCw className="spin" /> : 'Execute Allocation'}
                        </button>
                    </form>

                    {preview && (
                        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Preview: Top 10 Recipients</h4>
                                <span className="badge badge-success">{preview.length} Members to be credited</span>
                            </div>
                            <div className="table-wrap" style={{ maxHeight: 250, overflowY: 'auto' }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Member Name</th>
                                            <th>ID</th>
                                            <th style={{ textAlign: 'right' }}>Estimated Allocation</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.slice(0, 10).map((p, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontWeight: 700 }}>{p.name}</td>
                                                <td style={{ opacity: 0.6 }}>{p.membershipNumber || '---'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>KES {Math.round(p.amount).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        {preview.length > 10 && (
                                            <tr>
                                                <td colSpan="3" style={{ textAlign: 'center', padding: '1rem', background: 'var(--surface)', fontSize: '0.8rem', opacity: 0.6 }}>
                                                    ... and {preview.length - 10} more members
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                {/* Main History Section */}
                <div className="card shadow-md" style={{ padding: 0 }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <History size={18} /> Distribution Registry
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{history.length} Cycles Found</div>
                    </div>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Run Date</th>
                                    <th>Source Fund</th>
                                    <th>Method</th>
                                    <th>Total Pool</th>
                                    <th>Audit Note</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(h => (
                                    <tr key={h.id}>
                                        <td style={{ fontWeight: 700 }}>{new Date(h.distributionDate).toLocaleDateString()}</td>
                                        <td><span className="badge badge-success-outline" style={{ fontSize: '0.65rem' }}>{h.fundingSource || 'Reserves'}</span></td>
                                        <td><span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>{h.calcMethod.toUpperCase()}</span></td>
                                        <td style={{ fontWeight: 800, color: 'var(--success)' }}>KES {Number(h.totalPoolAmount).toLocaleString()}</td>
                                        <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{h.note || '---'}</td>
                                        <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button 
                                                className="btn btn-ghost btn-icon" 
                                                title="View Breakdown"
                                                onClick={() => setSelectedDiv(h)}
                                            >
                                                <Users size={16} />
                                            </button>
                                            <a 
                                                href={`/api/ict/dividend-engine/report/${h.id}?token=${localStorage.getItem('mp_token')}`}
                                                className="btn btn-ghost btn-icon"
                                                title="Download PDF Audit"
                                            >
                                                <Download size={16} />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                                {history.length === 0 && (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>No dividend distributions on record.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Performance Trend */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="card shadow-lg" style={{ padding: '1.5rem' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1.5rem', opacity: 0.7 }}>DISTRIBUTION TREND</h3>
                        <div style={{ width: '100%', height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide />
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: '8px', fontSize: '0.8rem' }}
                                        formatter={(v) => [`KES ${v.toLocaleString()}`, 'Pool']}
                                    />
                                    <Area type="monotone" dataKey="amount" stroke="var(--accent)" fillOpacity={1} fill="url(#colorAmt)" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card shadow-md" style={{ background: 'var(--accent)', color: '#fff' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 900, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Award size={18} /> Prosperity Insight</h3>
                        <p style={{ fontSize: '0.85rem', lineHeight: 1.5, opacity: 0.9, margin: 0 }}>
                            Dividends are calculated in real-time and credited directly to member <strong>Share Capital</strong> wallets. Members receive automated notifications upon successful allocation.
                        </p>
                        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                            <button 
                                className="btn btn-sm" 
                                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff' }}
                                onClick={() => { setIsEditingPolicy(true); setShowPolicy(true); }}
                            >
                                <RefreshCw size={14} style={{ marginRight: '0.4rem' }} /> Update Policy
                            </button>
                            <button 
                                className="btn btn-sm" 
                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff' }}
                                onClick={() => { setIsEditingPolicy(false); setShowPolicy(true); }}
                            >
                                <BookOpen size={14} style={{ marginRight: '0.4rem' }} /> View Policy
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {selectedDiv && <BreakdownModal dividend={selectedDiv} onClose={() => setSelectedDiv(null)} />}

            {/* Financial Policy Modal */}
            {showPolicy && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <Info className="text-accent" /> 
                                {isEditingPolicy ? 'Edit Financial Policy' : 'Dividend Financial Policy'}
                            </h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowPolicy(false)}>✕</button>
                        </div>
                        <div style={{ padding: '0.5rem 0' }}>
                            {isEditingPolicy ? (
                                <div className="form-group">
                                    <label className="label">Policy Markdown/Text</label>
                                    <textarea 
                                        className="input"
                                        style={{ minHeight: 300, fontFamily: 'monospace', fontSize: '0.85rem' }}
                                        value={policyContent}
                                        onChange={e => setPolicyContent(e.target.value)}
                                        placeholder="Enter the institutional dividend policy here..."
                                    />
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                        Tip: Use clear, numbered sections for better readability in the member portal.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                    {policyContent || 'No policy defined yet.'}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            {isEditingPolicy ? (
                                <>
                                    <button className="btn btn-ghost" onClick={() => { setIsEditingPolicy(false); fetchPolicy(); }}>Cancel</button>
                                    <button 
                                        className="btn btn-primary" 
                                        onClick={handleSavePolicy}
                                        disabled={savingPolicy}
                                    >
                                        {savingPolicy ? 'Saving...' : 'Save Policy Changes'}
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary" onClick={() => setShowPolicy(false)}>I Understand</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dividends;
