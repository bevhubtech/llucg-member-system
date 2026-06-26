import React, { useState, useEffect } from 'react';
import { apiFetch, getRole } from '../utils/api';
import { 
    CheckCircle2, XCircle, AlertCircle, 
    Wallet, Banknote, ShieldAlert, FileCheck,
    Download, RefreshCw, LogOut, Zap, Clock, ShieldCheck
} from 'lucide-react';
import { motion } from 'framer-motion';

const SettlementAudit = ({ memberId, onClearanceUpdate }) => {
    const [audit, setAudit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const role = getRole();
    const isICT = ['superadmin', 'ict_admin'].includes(role?.toLowerCase());

    const fetchAudit = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/members/${memberId}/settlement-audit`);
            const data = await res.json();
            setAudit(data);
            if (onClearanceUpdate) onClearanceUpdate(data.isReady);
        } catch (err) {
            setError('Failed to run compliance audit.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (memberId) fetchAudit();
    }, [memberId]);

    const fmt = (v) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(v);

    const downloadClearance = async () => {
        try {
            const res = await apiFetch(`/api/members/${memberId}/clearance-certificate.pdf`);
            if (!res.ok) throw new Error('Generation Failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Clearance_${audit.member.membershipNumber}.pdf`;
            a.click();
        } catch (e) {
            console.error(e);
            alert('Failed to generate clearance certificate.');
        }
    };

    const handleInitiateExit = async () => {
        if (!window.confirm(`Are you sure you want to initiate the exit process for ${audit.member.name}? This will lock the account and send it to ICT for final deactivation.`)) return;

        try {
            const res = await apiFetch(`/api/members/${memberId}/request-closure`, { method: 'POST' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Initiation failed');
            alert(result.message);
            fetchAudit(); 
        } catch (e) {
            alert(e.message);
        }
    };

    const handleFinalizeExit = async () => {
        if (!window.confirm(`PERMANENTLY DELETE ${audit.member.name}'s account? This action is IRREVERSIBLE and signifies that all financial settlements have been disbursed.`)) return;

        try {
            const res = await apiFetch(`/api/members/${memberId}/settle-and-close`, { method: 'POST' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Authorization failed');
            alert(result.message);
            fetchAudit();
            if (onClearanceUpdate) onClearanceUpdate(false); 
        } catch (e) {
            alert(e.message);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-12 gap-4">
            <RefreshCw className="animate-spin text-accent" size={32} />
            <p className="text-secondary">Running financial compliance audit...</p>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center text-danger flex flex-col items-center gap-3">
            <AlertCircle size={40} />
            <p>{error}</p>
            <button className="btn btn-ghost" onClick={fetchAudit}>Retry Audit</button>
        </div>
    );

    return (
        <div className="settlement-audit-wrap animate-in" style={{ padding: '2rem', background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Settlement Intelligence</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Verifying obligations for <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{audit.member.name}</span>
                </p>
            </div>

            {/* Checklist Grid */}
            <div className="grid grid-2" style={{ gap: '1rem', marginBottom: '2rem' }}>
                {audit.checklist.map(item => (
                    <div key={item.id} className="card" style={{ 
                        border: `1px solid ${item.status === 'blocked' ? 'var(--danger-dim)' : item.status === 'warning' ? 'var(--warning-dim)' : 'var(--success-dim)'}`,
                        background: 'var(--bg)',
                        padding: '1rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{item.label}</span>
                            {item.status === 'ready' ? <CheckCircle2 className="text-success" size={18} /> : 
                             item.status === 'warning' ? <AlertCircle className="text-warning" size={18} /> : 
                             <XCircle className="text-danger" size={18} />}
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                            {item.id === 'loans' || item.id === 'penalties' ? fmt(item.value) : item.value}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>{item.details}</div>
                    </div>
                ))}
            </div>

            {/* Financial Summary */}
            <div className="card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                        <span className="text-secondary">Gross Managed Savings</span>
                        <span style={{ fontWeight: 700 }}>{fmt(audit.totalSavings)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                        <span className="text-secondary">Total Encumbered (Debt)</span>
                        <span style={{ fontWeight: 700, color: 'var(--danger)' }}>- {fmt(audit.totalDebt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem' }}>
                        <span style={{ fontWeight: 700 }}>Estimated Net Settlement</span>
                        <span style={{ fontWeight: 900, fontSize: '1.5rem', color: audit.isReady ? 'var(--success)' : 'var(--text-primary)' }}>
                            {fmt(audit.netSettlement)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Verdict */}
            <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '12px', background: audit.isReady ? 'var(--success-dim)' : 'var(--danger-dim)', border: `1px solid ${audit.isReady ? 'var(--success)' : 'var(--danger)'}20` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {audit.isReady ? <CheckCircle2 size={20} color="var(--success)" /> : <XCircle size={20} color="var(--danger)" />}
                    <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: audit.isReady ? 'var(--success)' : 'var(--danger)' }}>
                            {audit.isReady ? 'Clearance Verified' : 'Settlement Blocked'}
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {audit.isReady ? 'Member has fulfilled all financial obligations and is eligible for exit.' : 'Outstanding obligations detected. Resolve all debts to proceed.'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-primary" style={{ flex: 1, fontWeight: 700 }} disabled={!audit.isReady} onClick={downloadClearance}>
                        <FileCheck size={18} /> Generate Clearance Certificate
                    </button>
                    <button className="btn btn-ghost" onClick={fetchAudit}>
                        <RefreshCw size={16} /> Re-run Audit
                    </button>
                </div>

                {!isICT && audit.member.status === 'active' && (
                    <button 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800, background: '#8b5cf6', borderColor: '#8b5cf6', color: '#fff' }} 
                        disabled={!audit.isReady}
                        onClick={handleInitiateExit}
                    >
                        <Zap size={18} /> Initiate Exit Process
                    </button>
                )}

                {isICT && audit.member.status === 'pending_closure' && (
                    <button 
                        className="btn btn-danger" 
                        style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800 }} 
                        onClick={handleFinalizeExit}
                    >
                        <ShieldCheck size={18} /> Authorize Final Settlement & Delete Account
                    </button>
                )}

                {audit.member.status === 'pending_closure' && !isICT && (
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--accent-dim)', borderRadius: '8px', color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 700 }}>
                        <Clock size={16} style={{ marginBottom: '-3px', marginRight: '0.5rem' }} /> Awaiting ICT Final Authorization
                    </div>
                )}

                {audit.member.status === 'closed' && (
                    <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--danger-dim)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 700 }}>
                        <LogOut size={16} style={{ marginBottom: '-3px', marginRight: '0.5rem' }} /> Account Permanently Closed
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettlementAudit;
