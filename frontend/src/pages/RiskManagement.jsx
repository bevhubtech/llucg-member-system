import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Shield, ShieldCheck, ShieldAlert, TrendingUp, TrendingDown, 
    AlertCircle, Users, Activity, Filter, Search, Info,
    ChevronRight, ArrowRight, Award, Zap, Heart, Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const fmt = n => Number(n).toLocaleString('en-KE');

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
    <div className="card shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{label}</p>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{value}</h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{sub}</p>
            </div>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}1A`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} />
            </div>
        </div>
    </div>
);

const RiskManagement = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedMember, setSelectedMember] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [scoreRes, alertRes] = await Promise.all([
                apiFetch('/api/risk/scores'),
                apiFetch('/api/risk/alerts')
            ]);
            if (scoreRes.ok) setMembers((await scoreRes.json()).members);
            if (alertRes.ok) setAlerts((await alertRes.json()).alerts);
        } catch (e) {
            console.error('Risk data fetch failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filtered = members.filter(m => 
        m.name.toLowerCase().includes(search.toLowerCase()) || 
        m.membershipNumber.toLowerCase().includes(search.toLowerCase())
    );

    const getScoreColor = (s) => {
        if (s >= 80) return '#10b981'; // Green
        if (s >= 60) return '#3b82f6'; // Blue
        if (s >= 40) return '#f59e0b'; // Amber
        return '#ef4444'; // Red
    };

    const scoreData = [
        { name: 'Critical (<40)', value: members.filter(m => m.score < 40).length, color: '#ef4444' },
        { name: 'Average (40-60)', value: members.filter(m => m.score >= 40 && m.score < 60).length, color: '#f59e0b' },
        { name: 'Good (60-80)', value: members.filter(m => m.score >= 60 && m.score < 80).length, color: '#3b82f6' },
        { name: 'Excellent (>80)', value: members.filter(m => m.score >= 80).length, color: '#10b981' },
    ];

    if (loading) return <div style={{ padding: '6rem', textAlign: 'center' }}><Activity className="spin text-accent" size={48} /></div>;

    return (
        <div className="risk-page" style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldCheck size={36} className="text-accent" /> Trust & Risk Intelligence
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Antigravity Trust Index (ATI): Quantifying member reliability through algorithmic credit scoring.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <StatCard label="Avg Trust Score" value={`${Math.round(members.reduce((a, b) => a + b.score, 0) / members.length)}%`} sub="System-wide reliability" icon={Activity} color="var(--accent)" />
                <StatCard label="High Risk Profiles" value={alerts.length} sub="Requiring manual review" icon={ShieldAlert} color="#ef4444" />
                <StatCard label="Platinum Members" value={members.filter(m => m.score >= 85).length} sub="Eligible for premium loans" icon={Award} color="#10b981" />
                <StatCard label="Active Defaults" value="0" sub="Last 30 days" icon={TrendingDown} color="#f59e0b" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem' }}>
                {/* --- MAIN DASHBOARD --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* Distribution Chart */}
                    <div className="card shadow-sm">
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.5rem' }}>Trust Score Distribution</h3>
                        <div style={{ height: 300, width: '100%' }}>
                            <ResponsiveContainer>
                                <BarChart data={scoreData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '0.75rem', fontWeight: 700 }} />
                                    <YAxis axisLine={false} tickLine={false} style={{ fontSize: '0.75rem' }} />
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8 }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                        {scoreData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Member Leaderboard */}
                    <div className="card shadow-sm" style={{ padding: 0 }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Member Trust Directory</h3>
                            <div className="search-box" style={{ width: 250 }}>
                                <Search size={16} />
                                <input placeholder="Search ID or Name..." value={search} onChange={e => setSearch(e.target.value)} />
                            </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Member Identity</th>
                                        <th>ATI Score</th>
                                        <th>Risk Breakdown</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(m => (
                                        <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedMember(m)}>
                                            <td>
                                                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{m.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>ID: {m.membershipNumber} • {m.phone}</div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${getScoreColor(m.score)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                                                        {m.score}
                                                    </div>
                                                    <div style={{ height: 4, width: 60, background: 'var(--bg-body)', borderRadius: 2 }}>
                                                        <div style={{ height: '100%', width: `${m.score}%`, background: getScoreColor(m.score), borderRadius: 2 }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <div title="Contributions" className="badge" style={{ background: `${getScoreColor(m.breakdown.contributions*2.5)}22`, color: getScoreColor(m.breakdown.contributions*2.5), fontSize: '0.65rem' }}>SAV: {m.breakdown.contributions}</div>
                                                    <div title="Punctuality" className="badge" style={{ background: `${getScoreColor(m.breakdown.punctuality*3.3)}22`, color: getScoreColor(m.breakdown.punctuality*3.3), fontSize: '0.65rem' }}>PNC: {m.breakdown.punctuality}</div>
                                                    <div title="Seniority" className="badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '0.65rem' }}>SNR: {m.breakdown.seniority}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMember(m)}><ChevronRight size={18} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* --- SIDEBAR PANEL --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Critical Alerts */}
                    <div className="card shadow-lg" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertCircle size={16} className="text-danger" /> System Warnings
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {alerts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>Grid secure. No active risk alerts.</div>
                            ) : (
                                alerts.map((a, i) => (
                                    <div key={i} className="card shadow-sm" style={{ background: '#1e293b', padding: '0.75rem', border: '1px solid #334155' }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{a.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#f87171', marginBottom: '0.5rem' }}>{a.reason}</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#f87171' }}>ATI: {a.score}</span>
                                            <button 
                                                className="btn btn-ghost btn-sm" 
                                                style={{ height: 24, fontSize: '0.65rem' }}
                                                onClick={() => navigate(`/members?id=${a.memberId}`)}
                                            >
                                                Review Account
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Member Details Overlay/Panel */}
                    <AnimatePresence>
                        {selectedMember && (
                            <motion.div 
                                initial={{ opacity: 0, x: 20 }} 
                                animate={{ opacity: 1, x: 0 }} 
                                exit={{ opacity: 0, x: 20 }}
                                className="card shadow-lg" 
                                style={{ background: 'var(--accent)', color: '#000', padding: '1.5rem' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                                        {selectedMember.name.charAt(0)}
                                    </div>
                                    <button className="btn-icon" onClick={() => setSelectedMember(null)} style={{ color: '#000' }}>✕</button>
                                </div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '0.25rem' }}>{selectedMember.name}</h3>
                                <p style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.7, marginBottom: '1.5rem' }}>MEMBER ID: {selectedMember.membershipNumber}</p>
                                
                                <div className="card shadow-sm" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', marginBottom: '1.5rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>TRUST SCORE VERDICT</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{selectedMember.score}%</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Status: {selectedMember.score > 70 ? 'PREMIUM' : selectedMember.score > 40 ? 'STABLE' : 'WATCHLIST'}</div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tenure:</span> <strong>{selectedMember.metrics.monthsActive} Months</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Repayment Lag:</span> <strong>{Math.round(selectedMember.metrics.avgOverdue)} Days Avg</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Penalty Count:</span> <strong>{selectedMember.metrics.penaltyCount}</strong></div>
                                </div>

                                <button 
                                    className="btn btn-primary" 
                                    style={{ width: '100%', marginTop: '1.5rem', background: '#000', color: '#fff', border: 'none' }}
                                    onClick={() => navigate(`/members?id=${selectedMember.id}`)}
                                >
                                    View Full Audit Trail <ArrowRight size={16} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default RiskManagement;
