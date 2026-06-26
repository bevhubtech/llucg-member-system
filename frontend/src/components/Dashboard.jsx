import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Banknote, CreditCard, Clock, TrendingUp, 
  ArrowUpRight, ArrowDownRight, RefreshCw, FileText,
  ShieldCheck, Heart, Percent, Scale, Briefcase, PiggyBank, Wallet, Info
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { apiFetch } from '../utils/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeLoans: 0,
    totalCapital: 0,
    pendingApps: 0,
    monthlyTrends: [],
    loanRepayment: [],
    pledgeStatus: [],
    fundBreakdown: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lexicon, setLexicon] = useState({});

  const getLabel = (key, def) => lexicon[key] || def;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch Stats
        try {
          const statsRes = await apiFetch('/api/stats/dashboard');
          const data = await statsRes.json();
          const totals = data.systemTotals || data;

          // Generate last 6 months list for fallback
          const last6Months = Array.from({ length: 6 }).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - i));
            return d.toLocaleString('en-US', { month: 'short' });
          });

          const rawTrends = data.paymentTrends || data.monthlyTrends || [];
          const monthlyTrends = last6Months.map((m, idx) => {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - idx));
            const yyyyMm = d.toISOString().substring(0, 7);
            const found = rawTrends.find(r => r.name === m || r.month === m || r.month === yyyyMm);
            return { name: m, value: Number(found?.value || found?.amount || found?.total || 0) };
          });

          setStats({
            ...data,
            totalMembers: Number(totals.members || totals.totalMembers || 0),
            activeLoans: Number(totals.activeLoans || totals.totalLoans || 0),
            totalCapital: Number(totals.totalCapital || 0),
            totalPersonal: Number(totals.totalPersonal || 0),
            totalInterest: Number(totals.totalInterest || 0),
            pendingApps: Number(totals.pendingApps || 0),
            monthlyTrends,
            loanRepayment: data.loanRepayment?.length ? data.loanRepayment : [
              { name: 'Loans', value: Number(data.totalLoanBalance || 0), color: '#ef4444' },
              { name: 'Repayments', value: Number(data.totalRepayments || 0), color: '#10b981' },
            ],
            pledgeStatus: data.pledgeStats?.map(p => ({ 
              name: p.status === 'fulfilled' ? 'Fulfilled' : 'Active', 
              value: Number(p.count || 0)
            })) || data.pledgeStatus || [
              { name: 'Fulfilled', value: 0 },
              { name: 'Active', value: 0 },
            ],
            fundBreakdown: data.fundBreakdown || []
          });
        } catch (err) {
          console.error('Stats fetch error:', err);
          setError('Failed to load dashboard metrics.');
        }

        // Fetch Lexicon (Separately, non-blocking)
        try {
          const lexRes = await apiFetch('/api/ict/lexicon');
          if (lexRes.ok) {
            const lexData = await lexRes.json();
            setLexicon(lexData.labels || {});
          }
        } catch (err) {
          console.warn('Lexicon fetch failed, using defaults:', err.message);
        }

      } catch (err) {
        console.error('General dashboard error:', err);
        setError('A critical error occurred while loading the dashboard.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fmt = (v) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(v);
  const handleExport = () => {
    const token = localStorage.getItem('mp_token');
    window.location.href = `/api/export/members?token=${token}`;
  };

  const getFundIcon = (name) => {
    switch(name) {
      case 'Penalties/Fines': return <Scale size={16} color="#f43f5e" />;
      case 'Welfare Fund': return <Heart size={16} color="#ec4899" />;
      case 'Interest from Loans': return <Percent size={16} color="#3b82f6" />;
      case 'Investment Profits': return <Briefcase size={16} color="#8b5cf6" />;
      case 'Institutional Reserves': return <ShieldCheck size={16} color="#10b981" />;
      case 'Member Savings': return <PiggyBank size={16} color="#6366f1" />;
      case 'Personal Savings': return <Wallet size={16} color="#f59e0b" />;
      default: return <Banknote size={16} />;
    }
  };

  const fundDescriptions = {
    'Penalties/Fines': 'Revenue collected from late loan repayments and disciplinary fines.',
    'Welfare Fund': 'Dedicated pool for member social support and emergency assistance.',
    'Interest from Loans': 'Direct profit generated from member loan interest payments.',
    'Investment Profits': 'Net gains from group assets and external investment activities.',
    'Institutional Reserves': 'Retained earnings used for system stability and SACCO operations.',
    'Member Savings': 'Total core savings contributed by the general membership.',
    'Personal Savings': 'Flexible funds held in individual member wallets for daily use.'
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><RefreshCw className="animate-spin" /></div>;

  return (
    <div className="dashboard-container">
      <div className="card-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h2 className="card-title" style={{ fontSize: '1.5rem' }}>{getLabel('dashboard_title', 'Group Insights')}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{getLabel('dashboard_subtitle', 'Visual intelligence and fund operations')}</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={handleExport}><FileText size={14} /> Export Members</button>
          <button className="btn btn-primary" style={{ background: '#6366f1' }} onClick={() => navigate('/payments')}>+ Record Movement</button>
        </div>
      </div>

      {/* Primary Metrics Row */}
      <div className="grid grid-3" style={{ marginBottom: '1.5rem', gap: '1.5rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{getLabel('dashboard_members_label', 'Total Members')}</span>
            <Users size={16} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{stats.totalMembers}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            {getLabel('dashboard_members_desc', 'Active and registered group participants.')}
          </p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{getLabel('dashboard_loans_label', 'Active Loans')}</span>
            <Banknote size={16} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{stats.activeLoans}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            {getLabel('dashboard_loans_desc', 'Total number of currently outstanding loan facilities.')}
          </p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{getLabel('dashboard_capital_label', 'Total Capital')}</span>
            <CreditCard size={16} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{fmt(stats.totalCapital)}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            {getLabel('dashboard_capital_desc', 'Consolidated sum of all savings and share capital.')}
          </p>
        </div>
      </div>

      {/* Fund Operations - NEW SECTION */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            {getLabel('dashboard_funds_title', 'Institutional Fund Liquidity')}
          </h3>
          <Info size={14} color="var(--text-dim)" title="Real-time breakdown of segregated fund buckets." style={{ cursor: 'help' }} />
        </div>
        <div className="fund-grid">
          {stats.fundBreakdown.map(fund => (
            <div key={fund.name} className="fund-card">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '8px' }}>
                      {getFundIcon(fund.name)}
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fund.name}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                  {fmt(fund.balance)}
                </div>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: '0.5rem 0', lineHeight: '1.3', opacity: 0.8 }}>
                  {fundDescriptions[fund.name] || 'Current liquidity for this fund pool.'}
                </p>
              </div>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${Math.min(100, (fund.balance / (stats.totalCapital || 1)) * 100)}%`, 
                  background: 'var(--accent)',
                  opacity: 0.6
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary Metrics & Charts */}
      <div className="grid grid-3" style={{ marginBottom: '2rem', gap: '1.5rem' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{getLabel('dashboard_personal_savings_label', 'Personal Savings')}</span>
            <Banknote size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>{fmt(stats.totalPersonal || 0)}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            {getLabel('dashboard_personal_savings_desc', 'Flexible funds held in individual member wallets.')}
          </p>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{getLabel('dashboard_pending_apps_label', 'Pending Loan Apps')}</span>
            <Clock size={16} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.pendingApps > 0 ? 'var(--warning)' : 'inherit' }}>{stats.pendingApps}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            {getLabel('dashboard_pending_apps_desc', 'New loan requests awaiting review and approval.')}
          </p>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(16,185,129,0.05) 100%)', border: '1px solid rgba(99,102,241,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>{getLabel('dashboard_interest_earned_label', 'Total Interest Earned')}</span>
            <TrendingUp size={16} color="#6366f1" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#6366f1' }}>{fmt(stats.totalInterest || 0)}</div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            {getLabel('dashboard_interest_earned_desc', 'Realized profit generated from loan interest payments.')}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-2">
        <div className="card">
          <h3 className="card-title" style={{ fontSize: '0.85rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <TrendingUp size={14} /> 6-Month Contribution Trends
          </h3>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthlyTrends}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `KES ${v/1000}k`} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>📊 Loan vs Repayment</h3>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.loanRepayment}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-dim)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {stats.loanRepayment.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
