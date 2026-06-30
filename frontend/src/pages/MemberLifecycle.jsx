import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch, getRole } from '../utils/api';
import { 
    Activity, Users, TrendingUp, Clock, Search, Download, 
    RefreshCw, ChevronRight, FileText, UserPlus, LogOut, 
    ShieldCheck, AlertCircle, Calendar, Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SettlementAudit from '../components/SettlementAudit';

const MemberLifecycle = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedMember, setSelectedMember] = useState(null);
    const [activeTab, setActiveTab] = useState('journey');
    const [toast, setToast] = useState(null);

    const isICT = ['superadmin', 'ict_admin'].includes((getRole() || '').toLowerCase());
const [editMemberId, setEditMemberId] = useState(null);
const [editMembershipNumber, setEditMembershipNumber] = useState('');

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchLifecycleData = async () => {
        setLoading(true);
        try {
            const r = await apiFetch('/api/reports/member-lifecycle-summary');
            const d = await r.json();
            setData(d.members || []);
        } catch (err) {
            showToast('Failed to load lifecycle intelligence.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLifecycleData();
    }, []);

    const filtered = useMemo(() => {
        return data.filter(m => 
            m.name?.toLowerCase().includes(search.toLowerCase()) || 
            m.phone?.includes(search) || 
            m.membershipNumber?.includes(search)
        );
    }, [data, search]);

    const stats = useMemo(() => {
        return {
            onboarding: data.filter(m => m.phase === 'Onboarding').length,
            active: data.filter(m => m.phase === 'Active Accumulator' || m.phase === 'Mature Saver').length,
            borrowing: data.filter(m => m.phase === 'Active Borrower').length,
            exiting: data.filter(m => m.phase.includes('Exit')).length
        };
    }, [data]);

    const handleOverride = async (phase) => {
        if (!selectedMember) return;
        try {
            const res = await apiFetch(`/api/members/${selectedMember.id}/lifecycle-override`, {
                method: 'POST',
                body: JSON.stringify({ phase })
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            showToast(d.message);
            fetchLifecycleData();
            setSelectedMember({ ...selectedMember, phase: phase || 'Auto-Calculated' });
        } catch (e) {
            showToast(e.message, 'error');
        }
    };

const handleMembershipUpdate = async (member) => {
    if (!editMembershipNumber) return;
    try {
        const res = await apiFetch(`/api/members/${member.id}`, {
            method: 'PUT',
            body: JSON.stringify({ membershipNumber: editMembershipNumber })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Member ID updated.');
        fetchLifecycleData();
        setEditMemberId(null);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

    const downloadStatement = async (id, name) => {
        try {
            const res = await apiFetch(`/api/members/${id}/statement.pdf`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Lifecycle_Statement_${name.replace(/\s+/g,'_')}.pdf`;
            a.click();
            showToast('Account statement generated.');
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
                        <Activity className="text-accent" size={32} /> Member Savings Lifecycle
                    </h1>
                    <p className="sub text-secondary">End-to-end tracking of member financial journeys from onboarding to exit.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={fetchLifecycleData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Syncing...' : 'Refresh Intel'}
                    </button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ zIndex: 1000 }}>{toast.msg}</div>}

            {/* Lifecycle Insights Row */}
            <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><UserPlus size={20} /></div>
                    <div className="stat-label">Onboarding</div>
                    <div className="stat-value">{stats.onboarding}</div>
                    <div className="stat-desc">Joined in last 90 days</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}><TrendingUp size={20} /></div>
                    <div className="stat-label">Stable Savers</div>
                    <div className="stat-value">{stats.active}</div>
                    <div className="stat-desc">Consistent accumulators</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                    <div className="stat-icon-wrap" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><ShieldCheck size={20} /></div>
                    <div className="stat-label">Leveraged Growth</div>
                    <div className="stat-value">{stats.borrowing}</div>
                    <div className="stat-desc">Active loan utilization</div>
                </div>
                <div className="card stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <div className="stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}><LogOut size={20} /></div>
                    <div className="stat-label">Exit Phase</div>
                    <div className="stat-value">{stats.exiting}</div>
                    <div className="stat-desc">Processing settlements</div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="card shadow-sm" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="search-box" style={{ maxWidth: 450, flexGrow: 1 }}>
                        <Search size={16} className="text-secondary" />
                        <input 
                            type="text" 
                            placeholder="Lookup member by name, phone or ID..." 
                            value={search} 
                            onChange={e => setSearch(e.target.value)} 
                        />
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                        Showing {filtered.length} Lifecycle Profiles
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="card shadow-sm p-0 overflow-hidden">
                <div className="table-wrap">
                    <table className="pro-table">
                        <thead>
                            <tr>
                                <th>Member Identity</th>
                                <th>Lifecycle Phase</th>
                                <th className="text-right">Total Managed</th>
                                <th className="text-center">Seniority</th>
                                <th className="text-center">Last Activity</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array(6).fill(0).map((_, i) => (
                                    <tr key={i} className="skeleton-row"><td colSpan="6" style={{ height: 64 }}></td></tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr className="empty-row text-center"><td colSpan="6" style={{ padding: '5rem 0' }}>No lifecycle data matching "{search}"</td></tr>
                            ) : (
                                filtered.map(m => (
                                    <tr key={m.id} className="hover-row">
                                        <td>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</div>
                                            {editMemberId === m.id ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input
                                                        type="text"
                                                        value={editMembershipNumber}
                                                        onChange={e => setEditMembershipNumber(e.target.value)}
                                                        placeholder="Enter SACCO ID"
                                                        className="input"
                                                        style={{ width: 150 }}
                                                    />
                                                    <button className="btn btn-primary btn-sm" onClick={() => handleMembershipUpdate(m)}>Save</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditMemberId(null)}>Cancel</button>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    {m.membershipNumber || m.phone}{' '}
                                                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditMemberId(m.id); setEditMembershipNumber(m.membershipNumber || ''); }}>Edit</button>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{ 
                                                fontSize: '0.7rem', 
                                                fontWeight: 800, 
                                                textTransform: 'uppercase',
                                                padding: '0.25rem 0.6rem',
                                                borderRadius: '20px',
                                                background: `${m.phaseColor}20`,
                                                color: m.phaseColor,
                                                border: `1px solid ${m.phaseColor}40`
                                            }}>
                                                {m.phase}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <div style={{ fontWeight: 700 }}>KES {(m.totalSavings || 0).toLocaleString()}</div>
                                        </td>
                                        <td className="text-center">
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{m.monthsActive} Mo.</div>
                                        </td>
                                        <td className="text-center">
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {m.lastActivity ? new Date(m.lastActivity).toLocaleDateString('en-GB') : 'N/A'}
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button 
                                                    className="btn btn-ghost btn-sm btn-icon" 
                                                    onClick={() => downloadStatement(m.id, m.name)}
                                                    title="Download Full Lifecycle Statement"
                                                >
                                                    <FileText size={18} />
                                                </button>
                                                <button 
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => { console.log('Opening Intel for', m.id); setSelectedMember(m); }}
                                                    style={{ padding: '0.4rem 0.8rem', borderRadius: '8px' }}
                                                >
                                                    Inspect Intelligence <ChevronRight size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Timeline Sidebar / Modal (Simulated) */}
            <AnimatePresence>
                {selectedMember && (
                    <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setSelectedMember(null)}>
                        <motion.div 
                            className="modal-box shadow-xl" 
                            style={{ maxWidth: 500, width: '90%', padding: 0, overflow: 'hidden' }}
                            initial={{ x: 50, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 50, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '1.5rem', background: 'var(--bg-body)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>Lifecycle Intelligence</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedMember.name} • {selectedMember.membershipNumber}</p>
                                </div>
                                <div style={{ display: 'flex', background: 'var(--bg-body)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <button 
                                        className={`btn btn-sm ${activeTab === 'journey' ? 'btn-primary' : 'btn-ghost'}`} 
                                        onClick={() => setActiveTab('journey')}
                                        style={{ fontSize: '0.7rem' }}
                                    >Journey</button>
                                    <button 
                                        className={`btn btn-sm ${activeTab === 'audit' ? 'btn-primary' : 'btn-ghost'}`} 
                                        onClick={() => setActiveTab('audit')}
                                        style={{ fontSize: '0.7rem' }}
                                    >Compliance Audit</button>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedMember(null); setActiveTab('journey'); }}>Close</button>
                            </div>
                            
                            <div style={{ padding: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
                                {activeTab === 'journey' ? (
                                    <div className="timeline" style={{ position: 'relative', paddingLeft: '2rem' }}>
                                        <div style={{ position: 'absolute', left: '0.45rem', top: 0, bottom: 0, width: '2px', background: 'var(--border)' }} />
                                        
                                        {/* Timeline Items */}
                                        <div style={{ marginBottom: '2rem', position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '-1.95rem', top: '0.2rem', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent)', border: '3px solid var(--card-bg)' }} />
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Account Created</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Member Onboarding</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(selectedMember.joinDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                        </div>

                                        <div style={{ marginBottom: '2rem', position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '-1.95rem', top: '0.2rem', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success)', border: '3px solid var(--card-bg)' }} />
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase' }}>First Contribution</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Capital Accumulation Started</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Successfully integrated into the group savings pool.</div>
                                        </div>

                                        {selectedMember.totalSavings > 0 && (
                                            <div style={{ marginBottom: '2rem', position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: '-1.95rem', top: '0.2rem', width: '12px', height: '12px', borderRadius: '50%', background: '#8b5cf6', border: '3px solid var(--card-bg)' }} />
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase' }}>Wealth Milestone</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Current Managed Capital</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 900, marginTop: '0.4rem' }}>KES {(selectedMember.totalSavings || 0).toLocaleString()}</div>
                                            </div>
                                        )}

                                        {selectedMember.activeLoans > 0 && (
                                            <div style={{ marginBottom: '2rem', position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: '-1.95rem', top: '0.2rem', width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', border: '3px solid var(--card-bg)' }} />
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>Leverage Phase</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Active Lending Utilization</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Member is actively utilizing group credit facilities.</div>
                                            </div>
                                        )}

                                        <div style={{ marginBottom: '1rem', position: 'relative', opacity: selectedMember.status === 'active' ? 0.4 : 1 }}>
                                            <div style={{ position: 'absolute', left: '-1.95rem', top: '0.2rem', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-secondary)', border: '3px solid var(--card-bg)' }} />
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Account Closure</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Final Settlement Phase</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {selectedMember.status === 'active' ? 'Account is currently healthy and active.' : 'Account has been deactivated/closed.'}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <SettlementAudit memberId={selectedMember.id} />
                                )}
                            </div>
                            
                            {isICT && (
                                <div style={{ padding: '1rem 1.5rem', background: 'rgba(99,102,241,0.05)', borderTop: '1px solid var(--border)' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)', display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase' }}>ICT Administration: Manual Phase Override</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <select 
                                            className="input" 
                                            style={{ fontSize: '0.8rem', height: '32px', padding: '0 0.5rem' }}
                                            value={selectedMember.phase === 'Onboarding' || selectedMember.phase === 'Active Accumulator' || selectedMember.phase === 'Mature Saver' || selectedMember.phase === 'Active Borrower' || selectedMember.phase === 'Exited / Inactive' || selectedMember.phase === 'Exiting (Processing)' ? selectedMember.phase : ''}
                                            onChange={(e) => handleOverride(e.target.value)}
                                        >
                                            <option value="">-- Use Auto-Calculation --</option>
                                            <option value="Onboarding">Onboarding</option>
                                            <option value="Active Accumulator">Active Accumulator</option>
                                            <option value="Mature Saver">Mature Saver</option>
                                            <option value="Active Borrower">Active Borrower</option>
                                            <option value="Exiting (Processing)">Exiting (Processing)</option>
                                            <option value="Exited / Inactive">Exited / Inactive</option>
                                        </select>
                                        {selectedMember.lifecycle_phase_override && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOverride('')} style={{ fontSize: '0.7rem' }}>Reset</button>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div style={{ padding: '1.25rem', background: 'var(--bg-body)', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem' }}>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => downloadStatement(selectedMember.id, selectedMember.name)}>
                                    <Download size={16} /> Export Detailed Intel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MemberLifecycle;
