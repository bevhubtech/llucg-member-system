import React, { useState, useEffect } from 'react';
import { 
    Banknote, PiggyBank, LifeBuoy, UserCheck, DollarSign, PieChart, Gavel, 
    AlertTriangle, Clock, Calendar, TrendingUp, RefreshCw, FileText, Download
} from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '../utils/api';

const StatCard = ({ label, value, sub, color, icon: Icon }) => (
    <div className="card shadow-sm" style={{ padding: '1.25rem', borderLeft: `4px solid ${color}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{label}</p>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{value}</h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{sub}</p>
            </div>
            {Icon && <Icon size={20} style={{ color, opacity: 0.8 }} />}
        </div>
    </div>
);

const FinancialGovernance = () => {
    const [portalCfg, setPortalCfg] = useState({});
    const [govFunds, setGovFunds] = useState({ 
        registrationFees: 0, 
        welfareFund: 0, 
        penaltiesCollected: 0,
        totalLoansDisbursed: 0,
        totalLoanRepayments: 0,
        totalLoanInterest: 0,
        activeLoans: []
    });
    const [settingsAudit, setSettingsAudit] = useState([]);
    const [busyId, setBusyId] = useState(null);

    const fetchPortalSettings = async () => {
        try {
            const r = await apiFetch('/api/system');
            if (r.ok) setPortalCfg((await r.json()).settings || {});
        } catch (e) {}
    };

    const fetchGovFunds = async () => {
        try {
            const r = await apiFetch('/api/reports/governance-funds');
            if (r.ok) setGovFunds(await r.json());
        } catch (e) {}
    };

    const fetchSettingsAudit = async () => {
        try {
            const r = await apiFetch('/api/ict/settings-audit');
            if (r.ok) setSettingsAudit((await r.json()).audit || []);
        } catch (e) {}
    };

    const toggleConfig = async (key, current) => {
        const next = current === 'true' ? 'false' : 'true';
        try {
            const r = await apiFetch('/api/system/settings', { method: 'PUT', body: JSON.stringify({ settings: { [key]: next } }) });
            if (r.ok) fetchPortalSettings();
        } catch (e) {}
    };

    const saveConfig = async (updates) => {
        setBusyId('saving_cfg');
        try {
            const r = await apiFetch('/api/system/settings', { method: 'PUT', body: JSON.stringify({ settings: updates }) });
            if (r.ok) {
                fetchPortalSettings();
                fetchSettingsAudit();
            }
        } catch (e) {}
        setBusyId(null);
    };

    useEffect(() => {
        fetchPortalSettings();
        fetchGovFunds();
        fetchSettingsAudit();
    }, []);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div className="header-bar" style={{ marginBottom: '2rem' }}>
                <div>
                    <h1 className="page-title"><Banknote size={28} className="text-accent" /> Strategic Financial Governance</h1>
                    <p className="page-subtitle">Centralized control for all SACCO fees, contributions, and penalty logic.</p>
                </div>
            </div>

            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => { fetchPortalSettings(); fetchSettingsAudit(); fetchGovFunds(); }}>
                    <RefreshCw size={18} /> Refresh Data
                </button>
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <StatCard label="System Liquidity" value={`KES ${govFunds.systemLiquidity?.toLocaleString() || '0'}`} sub="Available SACCO Cash" color="#10b981" icon={DollarSign} />
                <StatCard label="Total Institutional" value={`KES ${(govFunds.registrationFees + govFunds.welfareFund + govFunds.penaltiesCollected).toLocaleString()}`} sub="Non-Savings Capital" color="#8b5cf6" icon={PieChart} />
                <StatCard label="Loans Disbursed (Out)" value={`KES ${(govFunds.totalLoansDisbursed || 0).toLocaleString()}`} sub="Cash given as loans" color="var(--danger)" icon={TrendingUp} />
                <StatCard label="Loan Repayments (In)" value={`KES ${(govFunds.totalLoanRepayments || 0).toLocaleString()}`} sub="Cash recovered + interest" color="#10b981" icon={TrendingUp} />
                <StatCard label="Loan Interest Accrued" value={`KES ${(govFunds.totalLoanInterest || 0).toLocaleString()}`} sub="Expected Loan Profit" color="#3b82f6" icon={PieChart} />
                <StatCard label="Registration Fees" value={`KES ${govFunds.registrationFees.toLocaleString()}`} sub="Total Membership Income" color="var(--accent)" icon={UserCheck} />
                <StatCard label="Welfare Fund" value={`KES ${govFunds.welfareFund.toLocaleString()}`} sub="Current Pooled Welfare" color="#10b981" icon={LifeBuoy} />
                <StatCard label="Penalties" value={`KES ${govFunds.penaltiesCollected.toLocaleString()}`} sub="Collected Fine Revenue" color="var(--danger)" icon={Gavel} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
                {/* 1. Core Contributions */}
                <div className="card shadow-md">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <DollarSign size={20} className="text-accent" />
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Core Contribution Parameters</h3>
                    </div>
                    <div style={{ display: 'grid', gap: '1.25rem' }}>
                        {[
                            { key: 'contribution_target', label: 'Standard Monthly Savings', icon: PiggyBank },
                            { key: 'welfare_contribution_amount', label: 'Monthly Welfare Contribution', icon: LifeBuoy },
                            { key: 'registration_fee_amount', label: 'Membership Registration Fee', icon: UserCheck },
                        ].map(f => (
                            <div key={f.key} className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                    <f.icon size={14} /> {f.label}
                                </label>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <input 
                                        className="input" 
                                        type="number" 
                                        value={portalCfg[f.key] || ''} 
                                        onChange={e => setPortalCfg({...portalCfg, [f.key]: e.target.value})} 
                                    />
                                    <button className="btn btn-primary btn-sm" onClick={() => saveConfig({ [f.key]: portalCfg[f.key] })} disabled={busyId === 'saving_cfg'}>Update</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Penalty & Late Fee Engine */}
                <div className="card shadow-md">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <Gavel size={20} className="text-danger" />
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Penalty & Recovery Logic</h3>
                    </div>
                    <div style={{ display: 'grid', gap: '1.25rem' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Automated Penalties</label>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--bg-body)', padding: '0.75rem', borderRadius: 8 }}>
                                <div style={{ flex: 1, fontSize: '0.85rem' }}>Enable system-wide automated penalty triggers</div>
                                <button 
                                    className={`btn btn-sm ${portalCfg.auto_penalty_enabled === 'true' ? 'btn-success' : 'btn-ghost'}`}
                                    onClick={() => toggleConfig('auto_penalty_enabled', portalCfg.auto_penalty_enabled)}
                                >
                                    {portalCfg.auto_penalty_enabled === 'true' ? 'ACTIVE' : 'INACTIVE'}
                                </button>
                            </div>
                        </div>
                        {[
                            { key: 'auto_penalty_amount', label: 'Monthly Contribution Late Fine', icon: Gavel },
                            { key: 'absentee_penalty_amount', label: 'Meeting Absence Fine', icon: AlertTriangle },
                            { key: 'auto_penalty_days_overdue', label: 'Days Overdue Before Triggering', icon: Clock },
                            { key: 'penalty_grace_period', label: 'Additional Grace Period (Days)', icon: Calendar },
                        ].map(f => (
                            <div key={f.key} className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                    <f.icon size={14} /> {f.label}
                                </label>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <input 
                                        className="input" 
                                        type="number" 
                                        value={portalCfg[f.key] || ''} 
                                        onChange={e => setPortalCfg({...portalCfg, [f.key]: e.target.value})} 
                                    />
                                    <button className="btn btn-primary btn-sm" onClick={() => saveConfig({ [f.key]: portalCfg[f.key] })} disabled={busyId === 'saving_cfg'}>Update</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Lending & Interest */}
                <div className="card shadow-md">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <TrendingUp size={20} className="text-accent" />
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Lending & Interest Policy</h3>
                    </div>
                    <div style={{ display: 'grid', gap: '1.25rem' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Interest Computation Method</label>
                            <select 
                                className="input" 
                                value={portalCfg.default_loan_interest_type || 'flat'} 
                                onChange={e => saveConfig({ default_loan_interest_type: e.target.value })}
                            >
                                <option value="flat">Flat Rate (Constant on principal)</option>
                                <option value="reducing">Reducing Balance (On unpaid principal)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                <TrendingUp size={14} /> Default Annual Interest Rate (%)
                            </label>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <input 
                                    className="input" 
                                    type="number" 
                                    step="0.01"
                                    value={portalCfg.default_loan_interest_rate || ''} 
                                    onChange={e => setPortalCfg({...portalCfg, default_loan_interest_rate: e.target.value})} 
                                />
                                <button className="btn btn-primary btn-sm" onClick={() => saveConfig({ default_loan_interest_rate: portalCfg.default_loan_interest_rate })} disabled={busyId === 'saving_cfg'}>Update</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* 4. Strategic Financial Reporting Section */}
            <div className="card shadow-lg" style={{ marginBottom: '3rem', borderLeft: '4px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '0.25rem' }}>Strategic Financial Reporting</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Download consolidated reports regarding the exact health of the individual funds.</p>
                    </div>
                    <FileText size={32} className="text-accent" style={{ opacity: 0.5 }} />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    <div className="card shadow-sm" style={{ background: 'var(--bg-body)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <PieChart size={16} className="text-accent" /> Institutional Balance Sheet
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flex: 1 }}>Real-time liquidity status of Penalties, Welfare, Loan Interest, and Investment Profits.</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => window.open(`/api/reports/balance-sheet.pdf?token=${localStorage.getItem('mp_token')}`, '_blank')} className="btn btn-sm btn-primary" style={{ flex: 1 }}>
                                <Download size={14} /> PDF Report
                             </button>
                            <button onClick={() => window.open(`/api/reports/balance-sheet.csv?token=${localStorage.getItem('mp_token')}`, '_blank')} className="btn btn-sm btn-ghost" style={{ flex: 1 }}>
                                <FileText size={14} /> CSV Data
                            </button>
                        </div>
                    </div>

                    <div className="card shadow-sm" style={{ background: 'var(--bg-body)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <TrendingUp size={16} className="text-success" /> Loan Portfolio Analysis
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flex: 1 }}>Detailed breakdown of all active loans, outstanding interest, and projected returns.</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => window.open(`/api/reports/loans-portfolio.pdf?token=${localStorage.getItem('mp_token')}`, '_blank')} className="btn btn-sm btn-success" style={{ flex: 1 }}>
                                <Download size={14} /> PDF Report
                            </button>
                            <button onClick={() => window.open(`/api/reports/loans-portfolio.csv?token=${localStorage.getItem('mp_token')}`, '_blank')} className="btn btn-sm btn-ghost" style={{ flex: 1 }}>
                                <FileText size={14} /> CSV Data
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Active Loans Monitoring */}
            <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden', marginBottom: '3rem' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(99,102,241,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <TrendingUp size={20} className="text-accent" />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Active Loans Portfolio Monitoring</h3>
                    </div>
                    <span className="badge badge-success">{govFunds.activeLoans?.length || 0} ACTIVE LOANS</span>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table className="table">
                        <thead style={{ background: 'var(--bg-body)' }}>
                            <tr>
                                <th>Member</th>
                                <th>Principal</th>
                                <th>Interest</th>
                                <th>Disbursed</th>
                                <th>Repaid</th>
                                <th>Owed Balance</th>
                                <th>Due Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(!govFunds.activeLoans || govFunds.activeLoans.length === 0) ? (
                                <tr className="empty-row"><td colSpan="7" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No active loans in portfolio.</td></tr>
                            ) : (
                                govFunds.activeLoans.map(l => (
                                    <tr key={l.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{l.memberName}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{l.membershipNumber}</div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>KES {(l.originalPrincipal || l.amount).toLocaleString()}</td>
                                        <td style={{ color: '#f59e0b', fontSize: '0.85rem' }}>{l.interestRate}% ({(l.totalInterest || 0).toLocaleString()})</td>
                                        <td style={{ fontSize: '0.85rem' }}>{new Date(l.disbursedDate).toLocaleDateString()}</td>
                                        <td style={{ color: 'var(--success)', fontWeight: 600 }}>KES {(l.totalRepaid || 0).toLocaleString()}</td>
                                        <td style={{ color: 'var(--danger)', fontWeight: 800 }}>KES {(l.balance || 0).toLocaleString()}</td>
                                        <td style={{ fontSize: '0.85rem', color: new Date(l.dueDate) < new Date() ? 'var(--danger)' : 'inherit' }}>
                                            {new Date(l.dueDate).toLocaleDateString()}
                                            {new Date(l.dueDate) < new Date() && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', fontWeight: 900 }}>OVERDUE</span>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 5. Adjustment Audit Trail */}
            <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Financial Adjustment Audit Trail</h3>
                    <span className="badge badge-accent">AUTHORIZED CHANGES ONLY</span>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table className="table">
                        <thead style={{ background: 'var(--bg-body)' }}>
                            <tr><th>Parameter</th><th>Old Value</th><th>New Value</th><th>Adjusted By</th><th>Timestamp</th></tr>
                        </thead>
                        <tbody>
                            {settingsAudit.length === 0 ? <tr className="empty-row"><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No adjustment history found.</td></tr> : (
                                settingsAudit.map(a => (
                                    <tr key={a.id}>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.setting_key}</td>
                                        <td style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{a.old_value || 'NULL'}</td>
                                        <td style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem' }}>{a.new_value}</td>
                                        <td style={{ fontWeight: 600 }}>{a.changed_by}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{new Date(a.changed_at).toLocaleString()}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
};

export default FinancialGovernance;
