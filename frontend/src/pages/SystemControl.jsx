import React, { useState, useEffect, useCallback, useRef } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { 
    Activity, Shield, ShieldCheck, ShieldAlert, Cpu, HardDrive, 
    RefreshCw, Filter, Search, Plus, Trash2, Edit3, Save, X, 
    Unlock, Lock, Key, AlertTriangle, CheckCircle2, MessageSquare, 
    Megaphone, Mail, Phone, Smartphone, Terminal, 
    Database, Zap, Clock, Download, Info, Send, Bug, Image, BarChart3,
    ToggleLeft, TrendingUp, Users, DollarSign, Calendar, LifeBuoy,
    History, Play, Power, Server, Layout, ClipboardList, Eye, EyeOff, Bell, Award,
    CreditCard, PiggyBank, Banknote, Handshake, Receipt, FileText, PieChart, Map,
    LayoutDashboard, FileCheck, Settings as SettingsIcon, Gavel, UserCheck, Activity as ActivityIcon,
    Sun, Moon
} from 'lucide-react';
import MemberLifecycle from './MemberLifecycle';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { apiFetch, getRoleLabel } from '../utils/api';

/* ── HELPER COMPONENTS ── */

import BudgetTracker from './BudgetTracker';
import SettlementAudit from '../components/SettlementAudit';

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

const ResetPwdModal = ({ admin, onClose, onSaved }) => {
    const [pwd, setPwd] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    
    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await apiFetch(`/api/auth/users/${admin.id}/reset-password`, {
                method: 'POST', body: JSON.stringify({ newPassword: pwd })
            });
            if (!r.ok) throw new Error('Reset failed');
            onSaved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box shadow-lg" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>🔐 Reset Password</h3><button className="btn btn-ghost" onClick={onClose}><X size={18}/></button></div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Admin: <strong>{admin.username}</strong></p>
                {err && <div className="toast toast-error" style={{ marginBottom: '1rem' }}>{err}</div>}
                <form onSubmit={submit}>
                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                        <label>New Administrative Password</label>
                        <input className="input" type="password" required value={pwd} onChange={e=>setPwd(e.target.value)} minLength={6} placeholder="Min 6 characters" />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>{busy ? 'Syncing...' : 'Reset Password'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ConfirmModal = ({ title, msg, onConfirm, onClose, danger = true }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box shadow-lg" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose}><X size={18}/></button></div>
            <p style={{ margin: '1rem 0 1.5rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{msg}</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1 }} onClick={onConfirm}>Confirm Action</button>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
        </div>
    </div>
);

const AddAdminModal = ({ onClose, onSaved }) => {
    const [form, setForm] = useState({ username: '', password: '', role: 'admin', title: '', phone: '', email: '' });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await apiFetch('/api/auth/users', {
                method: 'POST', body: JSON.stringify(form)
            });
            if (!r.ok) {
                const d = await r.json();
                throw new Error(d.error || 'Provisioning failed');
            }
            onSaved();
        } catch (e) { setErr(e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box shadow-lg" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>🚀 Provision New Administrator</h3><button className="btn btn-ghost" onClick={onClose}><X size={18}/></button></div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Authorize a new principal with elevated system privileges.</p>
                
                {err && <div className="toast toast-error" style={{ marginBottom: '1.5rem' }}>{err}</div>}
                
                <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Login Username</label>
                        <input className="input" required value={form.username} onChange={e=>setForm({...form, username: e.target.value})} placeholder="e.g. jdoe_admin" />
                    </div>
                    <div className="form-group">
                        <label>Initial Password</label>
                        <input className="input" type="password" required value={form.password} onChange={e=>setForm({...form, password: e.target.value})} placeholder="••••••••" />
                    </div>
                    <div className="form-group">
                        <label>Security Phone</label>
                        <input className="input" value={form.phone} onChange={e=>setForm({...form, phone: e.target.value})} placeholder="+254..." />
                    </div>
                    <div className="form-group">
                        <label>System Role (Security)</label>
                        <select className="input" value={form.role} onChange={e=>setForm({...form, role: e.target.value})}>
                            <option value="superadmin">Super Admin (All)</option>
                            <option value="ict_admin">ICT Admin (Sys)</option>
                            <option value="finance_admin">Finance Admin</option>
                            <option value="treasurer">Treasurer</option>
                            <option value="secretary">Secretary</option>
                            <option value="staff">Staff / Clerk</option>
                            <option value="admin">Standard Admin</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Functional Title (Display)</label>
                        <input className="input" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} placeholder="e.g. Lead Developer" />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Email Address (Recovery & MFA)</label>
                        <input className="input" type="email" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} placeholder="admin@example.com" />
                    </div>
                    
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
                            {busy ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />} Commit Provisioning
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditableLabel = ({ labelKey, defaultValue, lexicon, setLexicon }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(lexicon[labelKey] || defaultValue);
    const textRef = useRef(null);

    useEffect(() => {
        setVal(lexicon[labelKey] || defaultValue);
    }, [lexicon, labelKey, defaultValue]);

    const handleBlur = () => {
        setIsEditing(false);
        const next = textRef.current.innerText.trim();
        if (next !== val) {
            setVal(next);
            setLexicon(prev => ({ ...prev, [labelKey]: next }));
        }
    };

    return (
        <span 
            ref={textRef}
            contentEditable={isEditing}
            onClick={() => setIsEditing(true)}
            onBlur={handleBlur}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            style={{ 
                cursor: 'pointer', 
                borderBottom: isEditing ? '2px solid var(--accent)' : '1px dashed rgba(var(--accent-rgb), 0.3)',
                padding: '0 2px',
                background: isEditing ? 'var(--bg-secondary)' : 'transparent',
                outline: 'none',
                transition: 'all 0.2s ease'
            }}
            title="Click to edit label"
        >
            {val}
        </span>
    );
};

const LiveLogConsole = () => {
    const [logs, setLogs] = useState([]);
    const [active, setActive] = useState(true);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!active) return;
        const token = localStorage.getItem('mp_token');
        const ev = new EventSource(`/api/ict/live-logs?token=${token}`);
        ev.onmessage = (e) => {
            const data = JSON.parse(e.data);
            setLogs(prev => [...prev.slice(-99), data]);
        };
        return () => ev.close();
    }, [active]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <div className="card shadow-sm" style={{ background: '#0b0e14', border: '1px solid #1e293b', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>
                    <Terminal size={14} /> SYSTEM LOG STREAM
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setLogs([])} style={{ height: 24, fontSize: '0.65rem' }}>Clear Buffer</button>
                    <button className={`btn btn-sm ${active ? 'btn-danger' : 'btn-success'}`} onClick={() => setActive(!active)} style={{ height: 24, fontSize: '0.65rem' }}>{active ? 'Pause Feed' : 'Resume Feed'}</button>
                </div>
            </div>
            <div ref={scrollRef} style={{ height: 400, overflowY: 'auto', padding: '1rem', fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '0.75rem', lineHeight: 1.5, color: '#e2e8f0' }}>
                {logs.length === 0 && <div style={{ color: '#475569', textAlign: 'center', marginTop: '2rem' }}>Waiting for system events...</div>}
                {logs.map((L, i) => (
                    <div key={i} style={{ marginBottom: '0.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.25rem' }}>
                        <span style={{ color: '#475569', marginRight: '0.5rem' }}>[{new Date(L.ts).toLocaleTimeString()}]</span>
                        <span style={{ 
                            color: L.level === 'error' ? '#f87171' : L.level === 'warn' ? '#fbbf24' : '#38bdf8',
                            fontWeight: 700, marginRight: '0.5rem', textTransform: 'uppercase'
                        }}>{L.level}</span>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{L.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ── MAIN COMPONENT ── */

const SystemControl = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState(searchParams.get('tab') || 'system-health');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    const [search, setSearch] = useState('');
    
    // Core Data
    const [perfMetrics, setPerfMetrics] = useState(null);
    const [security, setSecurity] = useState(null);
    const [admins, setAdmins] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [showApi, setShowApi] = useState(false);
    const [unifiedSummary, setUnifiedSummary] = useState(null);
    const [divHistory, setDivHistory] = useState([]);
    
    // Tab Specific States
    const [announcement, setAnnouncement] = useState({ enabled: false, message: '', severity: 'info' });
    const [backups, setBackups] = useState([]);
    const [lexicon, setLexicon] = useState({});
    const [activePortal, setActivePortal] = useState('admin');
    const fetchLexicon = async () => {
        try {
            const r = await apiFetch('/api/ict/lexicon');
            if (r.ok) setLexicon((await r.json()).labels || {});
        } catch (e) {}
    };
    const publishLexicon = async (currentLexicon) => {
        setBusyId('saving_lexicon');
        try {
            const r = await apiFetch('/api/ict/lexicon', {
                method: 'PUT',
                body: JSON.stringify({ labels: currentLexicon })
            });
            if (r.ok) {
                showToast('Lexicon synchronized with production.');
                fetchLexicon();
            }
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };
    const [pendingClosures, setPendingClosures] = useState([]);
    const fetchPendingClosures = async () => {
        try {
            const r = await apiFetch('/api/members/pending-closures');
            if (r.ok) setPendingClosures(await r.json());
        } catch (e) {
            console.error("Pending closures fetch failed:", e.message);
            if (e.message.includes('403')) {
                setError("ICT Privileges required to view this queue.");
            } else {
                setError("Failed to refresh closure queue: " + e.message);
            }
        }
    };
    
    // Admin Edit States
    const [editingAdmin, setEditingAdmin] = useState(null);
    const [editForm, setEditForm] = useState({ fullName: '', role: '', title: '', phone: '', username: '' });
    const [showAddAdmin, setShowAddAdmin] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [resetAdmin, setResetAdmin] = useState(null);
    const [deleteAdmin, setDeleteAdmin] = useState(null);

    // Welfare Intelligence
    const [welfareStats, setWelfareStats] = useState(null);
    const [welfareHistory, setWelfareHistory] = useState([]);
    const fetchWelfareData = async () => {
        try {
            const [sRes, hRes] = await Promise.all([
                apiFetch('/api/ict/welfare/summary'),
                apiFetch('/api/ict/welfare/history')
            ]);
            if (sRes.ok) setWelfareStats(await sRes.json());
            if (hRes.ok) setWelfareHistory((await hRes.json()).history || []);
        } catch (e) {}
    };

    // Dividend Engine
    const [divForm, setDivForm] = useState({ poolAmount: '', method: 'proportional', note: '', fundingSource: 'Investment Profits' });
    const [divResult, setDivResult] = useState(null);

    // Rate Limiting
    const [rateLimits, setRateLimits] = useState({ global: 500, auth: 30 });
    const fetchRateLimits = async () => {
        try {
            const r = await apiFetch('/api/ict/rate-limits');
            if (r.ok) setRateLimits(await r.json());
        } catch (e) {}
    };

    const fetchAuditLogs = async () => {
        try {
            const r = await apiFetch('/api/system/audit/logs');
            if (r.ok) {
                const data = await r.json();
                setAuditLogs(data.logs || []);
            }
        } catch (e) {}
    };
    const saveRateLimits = async () => {
        setBusyId('saving_limits');
        try {
            const r = await apiFetch('/api/ict/rate-limits', {
                method: 'PUT',
                body: JSON.stringify(rateLimits)
            });
            if (r.ok) showToast('Rate limits synchronized.');
            else {
                const d = await r.json();
                showToast(d.error, 'error');
            }
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    const [selectedModule, setSelectedModule] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            // Individual fetches with catch to avoid total failure
            await Promise.allSettled([
                apiFetch('/api/ict/performance').then(r => r.ok && r.json()).then(d => d && setPerfMetrics(d)),
                apiFetch('/api/auth/users').then(r => r.ok && r.json()).then(d => d && setAdmins(d.users || [])),
                apiFetch('/api/ict/unified-summary').then(r => r.ok && r.json()).then(d => d && setUnifiedSummary(d)),
                apiFetch('/api/ict/dividends').then(r => r.ok && r.json()).then(d => d && setDivHistory(d.dividends || [])),
                fetchRateLimits(),
                fetchAuditLogs()
            ]);
            setError(null);
        } catch (err) {
            console.error("SystemControl fetchAll error:", err);
            setError('System Control Plane partially degraded. Retrying logic active.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleTabChange = (t) => {
        setTab(t);
        setSearchParams({ tab: t });
    };

    // --- TAB SPECIFIC FETCHING ---
    const [hcResults, setHcResults] = useState(null);
    const [cronJobs, setCronJobs] = useState([]);

    const runHealthCheck = async () => {
        setHcResults({ status: 'running', checks: [] });
        try {
            const r = await apiFetch('/api/ict/health-check');
            if (r.ok) setHcResults(await r.json());
        } catch (e) { showToast('Health check failed', 'error'); }
    };

    const fetchCrons = async () => {
        try {
            const r = await apiFetch('/api/ict/cron/status');
            if (r.ok) setCronJobs((await r.json()).jobs || []);
        } catch (e) {}
    };

    const triggerCron = async (jobId) => {
        setBusyId(jobId);
        try {
            const r = await apiFetch('/api/ict/cron/trigger', { method: 'POST', body: JSON.stringify({ jobId }) });
            const data = await r.json();
            if (r.ok) {
                showToast(data.message || 'Cron triggered successfully');
                fetchCrons();
            } else throw new Error(data.error);
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    useEffect(() => {
        const triggers = {
            'health-checker': () => !hcResults && runHealthCheck(),
            'cron-jobs': fetchCrons,
            'backups': fetchBackups,
            'error-logs': fetchErrorLogs,
            'admin-alerts': fetchAnnouncement,
            'sms-templates': fetchSmsTemplates,
            'data-tools': fetchDataSummary,
            'alert-config': fetchAlertConfig,
            'logo-assets': fetchLogoStatus,
            'active-sessions': fetchSessions,
            'verification-codes': fetchResets,
            'full-audit-trail': fetchGlobalAudit,
            'security-recovery': fetchSecurityAlerts,
            'sms-gateway': fetchSmsGateway,
            'portal-config': fetchPortalSettings,
            'access-governance': fetchRbacStatus,
            'navigation-manager': fetchPortalSettings,
            'visual-customizer': fetchLexicon,
            'welfare-intelligence': fetchWelfareData,
            'credentials': fetchVault,
            'config-history': fetchConfigHistory,
            'content-labels': fetchLabels,
            'brand-identity': fetchBrandCfg,
            'sched-maintenance': fetchMaintenanceWindows,
            'admins': fetchAll,
            'financial-governance': () => { fetchPortalSettings(); fetchSettingsAudit(); fetchGovFunds(); },
            'security-limits': fetchRateLimits,
            'system-recovery': fetchWipes,
            'settlement-auth': fetchPendingClosures,
            'performance': () => !perfMetrics && fetchAll()
        };
        if (triggers[tab]) triggers[tab]();
    }, [tab]);

    // --- CONFIG HISTORY ---
    const [cfgHist, setCfgHist] = useState([]);
    const fetchConfigHistory = async () => {
        try {
            const r = await apiFetch('/api/ict/config-history');
            if (r.ok) setCfgHist((await r.json()).history || []);
        } catch (e) {}
    };

    // --- CONTENT & LABELS ---
    const [labels, setLabels] = useState({});
    const fetchLabels = async () => {
        try {
            const r = await apiFetch('/api/ict/content-labels');
            if (r.ok) setLabels((await r.json()).labels || {});
        } catch (e) {}
    };
    const saveLabels = async () => {
        setBusyId('saving_labels');
        try {
            const r = await apiFetch('/api/ict/content-labels', { method: 'PUT', body: JSON.stringify({ labels }) });
            if (r.ok) showToast('Lexicon synchronized.');
        } catch (e) {}
        finally { setBusyId(null); }
    };

    // --- BRAND IDENTITY ---
    const [brandCfg, setBrandCfg] = useState({ primaryColor: '#3b82f6', secondaryColor: '#1e293b', portalTitle: 'LLUCG Sacco Portal', loginTitle: 'LIFE-LONG UNITY', loginSubtitle: 'Member Portal', loginTagline: 'Financial stability for every member' });
    const fetchBrandCfg = async () => {
        try {
            const r = await apiFetch('/api/ict/brand-config');
            if (r.ok) setBrandCfg(await r.json());
        } catch (e) {}
    };
    const saveBrand = async () => {
        setBusyId('saving_brand');
        try {
            const r = await apiFetch('/api/ict/brand-config', { method: 'PUT', body: JSON.stringify(brandCfg) });
            if (r.ok) showToast('Visual identity projected.');
        } catch (e) {}
        finally { setBusyId(null); }
    };

    // --- SCHED MAINTENANCE ---
    const [maintWindows, setMaintWindows] = useState([]);
    const fetchMaintenanceWindows = async () => {
        try {
            const r = await apiFetch('/api/ict/scheduled-maintenance');
            if (r.ok) setMaintWindows((await r.json()).windows || []);
        } catch (e) {}
    };

    // --- DIVIDEND ENGINE ---
    const runDividendEngine = async (e) => {
        e.preventDefault();
        if (!window.confirm(`Triggering dividend allocation for ALL members based on ${divForm.method} logic. Confirm execution?`)) return;
        setBusyId('dividend_run');
        try {
            const r = await apiFetch('/api/ict/dividend-engine/execute', { method: 'POST', body: JSON.stringify(divForm) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setDivResult(d);
            showToast('Dividend cycle completed successfully.');
            apiFetch('/api/ict/dividends').then(r => r.ok && r.json()).then(res => setDivHistory(res.dividends || []));
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    // --- SMS GATEWAY ---
    const [smsCfg, setSmsCfg] = useState({ username: '', apiKey: '', senderId: '', provider: 'africastalking' });
    const fetchSmsGateway = async () => {
        try {
            const r = await apiFetch('/api/ict/sms-gateway');
            if (r.ok) setSmsCfg(await r.json());
        } catch (e) {}
    };
    const saveSmsGateway = async (e) => {
        e.preventDefault();
        setBusyId('saving_sms_gw');
        try {
            const r = await apiFetch('/api/ict/sms-gateway', { method: 'PUT', body: JSON.stringify(smsCfg) });
            if (r.ok) showToast('SMS Gateway credentials updated.');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    // --- PORTAL CONFIG ---
    const [portalCfg, setPortalCfg] = useState({});
    const [govFunds, setGovFunds] = useState({ registrationFees: 0, welfareFund: 0, penaltiesCollected: 0 });

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
                showToast('System parameters synchronized.');
                fetchPortalSettings();
            } else {
                const data = await r.json();
                throw new Error(data.error || 'Sync failed');
            }
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    // --- SETTINGS AUDIT (Financial Governance) ---
    const [settingsAudit, setSettingsAudit] = useState([]);
    const fetchSettingsAudit = async () => {
        try {
            const r = await apiFetch('/api/ict/settings-audit');
            if (r.ok) setSettingsAudit((await r.json()).audit || []);
        } catch (e) {}
    };

    // --- RBAC / GOVERNANCE ---
    const [rbac, setRbac] = useState({ roles: [], permissions: {} });
    const fetchRbacStatus = async () => {
        try {
            const r = await apiFetch('/api/ict/rbac-status');
            if (r.ok) setRbac(await r.json());
        } catch (e) {}
    };

    // --- CREDENTIAL VAULT ---
    const [vault, setVault] = useState([]);
    const fetchVault = async () => {
        try {
            const r = await apiFetch('/api/ict/vault');
            if (r.ok) setVault((await r.json()).credentials || []);
        } catch (e) {}
    };

    // --- SESSIONS ---
    const [sessions, setSessions] = useState([]);

    const fetchSessions = async () => {
        try {
            const r = await apiFetch('/api/system/sessions');
            if (r.ok) setSessions((await r.json()).sessions || []);
        } catch (e) {}
    };
    const revokeSession = async (sid, type) => {
        if (!window.confirm('Forcibly terminate this member session?')) return;
        setBusyId(sid);
        try {
            const r = await apiFetch('/api/system/sessions/revoke', { method: 'POST', body: JSON.stringify({ sessionId: sid, type }) });
            if (r.ok) { showToast('Session annihilated.'); fetchSessions(); }
        } catch (e) {}
        finally { setBusyId(null); }
    };

    // --- VERIFICATION CODES ---
    const [resets, setResets] = useState([]);
    const fetchResets = async () => {
        try {
            const r = await apiFetch('/api/system/member-resets');
            if (r.ok) setResets((await r.json()).resets || []);
        } catch (e) {}
    };

    // --- GLOBAL AUDIT ---
    const [globalAudit, setGlobalAudit] = useState([]);
    const fetchGlobalAudit = async () => {
        try {
            const r = await apiFetch('/api/system/audit/logs');
            if (r.ok) setGlobalAudit((await r.json()).logs || []);
        } catch (e) {}
    };

    // --- SECURITY & RECOVERY ---
    const [lockedUsers, setLockedUsers] = useState([]);
    const fetchSecurityAlerts = async () => {
        try {
            const r = await apiFetch('/api/system/locked-accounts');
            if (r.ok) setLockedUsers((await r.json()).locked || []);
        } catch (e) {}
    };
    const unlockUser = async (userId, type) => {
        setBusyId(userId);
        try {
            const r = await apiFetch('/api/system/unlock-account', { method: 'POST', body: JSON.stringify({ userId, type }) });
            if (r.ok) { showToast('Account credentials restored.'); fetchSecurityAlerts(); }
        } catch (e) {}
        finally { setBusyId(null); }
    };

    // --- SMS TEMPLATES ---
    const [smsTpl, setSmsTpl] = useState({ templates: {}, defaults: {} });
    const fetchSmsTemplates = async () => {
        try {
            const r = await apiFetch('/api/ict/sms-templates');
            if (r.ok) setSmsTpl(await r.json());
        } catch (e) {}
    };
    const saveSmsTemplates = async (e) => {
        e.preventDefault();
        setBusyId('saving_sms');
        try {
            const r = await apiFetch('/api/ict/sms-templates', { method: 'PUT', body: JSON.stringify({ templates: smsTpl?.templates }) });
            if (r.ok) showToast('SMS templates synchronized.');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    // --- SYSTEM WIPE & RECOVERY ---
    const [wipes, setWipes] = useState([]);
    const [wipeConfirmText, setWipeConfirmText] = useState('');
    const [showWipeModal, setShowWipeModal] = useState(false);

    const fetchWipes = async () => {
        try {
            const r = await apiFetch('/api/ict/system-wipe/history');
            if (r.ok) setWipes((await r.json()).wipes || []);
        } catch (e) {}
    };

    const handleSystemWipe = async () => {
        if (wipeConfirmText !== 'CONFIRM WIPE') return;
        setBusyId('executing_wipe');
        try {
            const r = await apiFetch('/api/ict/system-wipe/execute', { 
                method: 'POST', 
                body: JSON.stringify({ confirmText: wipeConfirmText }) 
            });
            const d = await r.json();
            if (r.ok) {
                showToast('System data wiped. Safety backup created.');
                setShowWipeModal(false);
                setWipeConfirmText('');
                fetchWipes();
                fetchAll(); // Refresh stats
            } else throw new Error(d.error);
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    const purgeWipe = async (filename) => {
        if (!window.confirm('PERMANENTLY DELETE this wipe backup? This cannot be undone.')) return;
        setBusyId(filename);
        try {
            const r = await apiFetch(`/api/ict/system-wipe/purge/${filename}`, { method: 'POST' });
            if (r.ok) {
                showToast('Wipe backup purged forever.');
                fetchWipes();
            }
        } catch (e) {}
        finally { setBusyId(null); }
    };

    // --- DATA TOOLS ---
    const [dataSummary, setDataSummary] = useState(null);
    const [toolResult, setToolResult] = useState(null);
    const fetchDataSummary = async () => {
        try {
            const r = await apiFetch('/api/ict/data-tools/summary');
            if (r.ok) setDataSummary(await r.json());
        } catch (e) {}
    };
    const runDataTool = async (tool) => {
        setBusyId(tool);
        setToolResult({ status: 'running', message: 'Executing tool logic...' });
        try {
            const r = await apiFetch('/api/ict/data-tools/run', { method: 'POST', body: JSON.stringify({ tool }) });
            const data = await r.json();
            if (r.ok) {
                setToolResult(data.result);
                fetchDataSummary();
                showToast(`Operation ${tool} complete.`);
            } else throw new Error(data.error);
        } catch (e) { showToast(e.message, 'error'); setToolResult({ status: 'error', message: e.message }); }
        finally { setBusyId(null); }
    };

    // --- ALERT CONFIG ---
    const [alertCfg, setAlertCfg] = useState({ alertPhones: '', memThreshold: 85, errorThreshold: 20, authFailThreshold: 10, alertEnabled: true });
    const fetchAlertConfig = async () => {
        try {
            const r = await apiFetch('/api/ict/alert-config');
            if (r.ok) setAlertCfg(await r.json());
        } catch (e) {}
    };
    const saveAlertConfig = async (e) => {
        e.preventDefault();
        setBusyId('saving_alert');
        try {
            const r = await apiFetch('/api/ict/alert-config', { method: 'PUT', body: JSON.stringify(alertCfg) });
            if (r.ok) showToast('Alert thresholds updated.');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    // --- LOGO & ASSETS ---
    const [logoStatus, setLogoStatus] = useState({ exists: false, size: 0 });
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const fetchLogoStatus = async () => {
        try {
            const r = await apiFetch('/api/ict/assets/logo-exists');
            if (r.ok) setLogoStatus(await r.json());
        } catch (e) {}
    };
    const handleLogoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingLogo(true);
        const formData = new FormData();
        formData.append('logo', file);
        try {
            const token = localStorage.getItem('mp_token');
            const r = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:5001'}/api/ict/upload-logo`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await r.json();
            if (r.ok) {
                showToast('Brand identity updated. Refresh required.');
                fetchLogoStatus();
            } else throw new Error(data.error);
        } catch (e) { showToast(e.message, 'error'); }
        finally { setUploadingLogo(false); }
    };

    // --- SNAPSHOTS / BACKUPS ---
    const [backupData, setBackupData] = useState({ backups: [], schedule: {} });
    const fetchBackups = async () => {
        try {
            const r = await apiFetch('/api/ict/backups');
            if (r.ok) setBackupData(await r.json());
        } catch (e) {}
    };
    const createBackup = async () => {
        setBusyId('creating_backup');
        try {
            const r = await apiFetch('/api/ict/backups/create', { method: 'POST' });
            if (r.ok) { showToast('Database snapshot generated.'); fetchBackups(); }
        } catch (e) { showToast('Backup failed', 'error'); }
        finally { setBusyId(null); }
    };
    const deleteBackup = async (filename) => {
        if (!window.confirm(`Permanently purge snapshot "${filename}"?`)) return;
        try {
            const r = await apiFetch(`/api/ict/backups/${filename}`, { method: 'DELETE' });
            if (r.ok) { showToast('Snapshot purged.'); fetchBackups(); }
        } catch (e) {}
    };

    // --- ERROR LOGS ---
    const [errorLogs, setErrorLogs] = useState([]);
    const fetchErrorLogs = async () => {
        try {
            const r = await apiFetch('/api/ict/error-logs');
            if (r.ok) setErrorLogs((await r.json()).logs || []);
        } catch (e) {}
    };
    const clearErrorLogs = async () => {
        if (!window.confirm('Clear all kernel error logs?')) return;
        try {
            const r = await apiFetch('/api/ict/error-logs', { method: 'DELETE' });
            if (r.ok) { showToast('Error log cleared.'); fetchErrorLogs(); }
        } catch (e) {}
    };

    // --- ANNOUNCEMENTS ---
    const [annForm, setAnnForm] = useState({ enabled: false, message: '', severity: 'info', expiresAt: '' });
    const fetchAnnouncement = async () => {
        try {
            const r = await apiFetch('/api/ict/announcement');
            if (r.ok) setAnnForm(await r.json());
        } catch (e) {}
    };
    const saveAnnouncement = async (e) => {
        e.preventDefault();
        setBusyId('saving_ann');
        try {
            const r = await apiFetch('/api/ict/announcement', { method: 'PUT', body: JSON.stringify(annForm) });
            if (r.ok) showToast('Announcement broadcast updated.');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setBusyId(null); }
    };

    const startEditAdmin = (admin) => {
        setEditingAdmin(admin);
        setEditForm({
            fullName: admin.fullName || '',
            username: admin.username || '',
            role: admin.role || 'admin',
            title: admin.title || '',
            phone: admin.phone || '',
            email: admin.email || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleUpdateAdmin = async (e) => {
        e.preventDefault();
        setBusyId(editingAdmin.id);
        try {
            const r = await apiFetch(`/api/auth/users/${editingAdmin.id}`, {
                method: 'PUT',
                body: JSON.stringify({ role: editForm.role, title: editForm.title, phone: editForm.phone, username: editForm.username, email: editForm.email })
            });
            if (!r.ok) {
                const data = await r.json();
                throw new Error(data.error || 'Identity reconfiguration failed');
            }
            showToast('Admin profile updated successfully.');
            setEditingAdmin(null);
            fetchAll();
        } catch (err) { showToast(err.message, 'error'); }
        finally { setBusyId(null); }
    };

    const executeDelete = async () => {
        const u = deleteAdmin;
        setDeleteAdmin(null);
        setBusyId(u.id);
        try {
            const r = await apiFetch(`/api/auth/users/${u.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('Deletion failed');
            showToast(`Admin account "${u.username}" purged.`);
            fetchAll();
        } catch (e) { showToast(e.message, 'error'); }
        setBusyId(null);
    };

    const sections = [
        {
            title: 'Infrastructure & Intelligence',
            items: [
                { id: 'system-health', label: 'Health & Analytics', icon: Activity },
                { id: 'health-checker', label: 'Health Checker', icon: ShieldCheck },
                { id: 'performance', label: 'Hardware Metrics', icon: Cpu },
                { id: 'live-console', label: 'Live System Logs', icon: Terminal },
                { id: 'error-logs', label: 'Error Logs', icon: Bug },
                { id: 'cron-jobs', label: 'Cron Jobs', icon: RefreshCw },
                { id: 'backups', label: 'Database Snapshots', icon: HardDrive },
                { id: 'system-recovery', label: 'System Recovery & Wipe', icon: RefreshCw },
                { id: 'alert-config', label: 'Alert Config', icon: Bell },
            ]
        },
        {
            title: 'Security & Identity',
            items: [
                { id: 'admins', label: 'Admin Access / Management', icon: Shield },
                { id: 'active-sessions', label: 'Security Sessions', icon: Smartphone },
                { id: 'full-audit-trail', label: 'Forensic Audit', icon: ClipboardList },
                { id: 'verification-codes', label: 'Verification Codes', icon: Key },
                { id: 'security-recovery', label: 'Security & Recovery', icon: ShieldAlert },
                { id: 'security-limits', label: 'Rate Limits', icon: Zap },
                { id: 'access-governance', label: 'Access Governance', icon: CheckCircle2 },
                { id: 'credentials', label: 'System Credentials', icon: Lock },
            ]
        },
        {
            title: 'Operational Governance',
            items: [
                { id: 'admin-alerts', label: 'Administrative Alerts', icon: Megaphone },
                { id: 'logo-assets', label: 'Asset Management', icon: Image },
                { id: 'sms-gateway', label: 'SMS Gateway', icon: Mail },
                { id: 'sms-templates', label: 'SMS Templates', icon: MessageSquare },
                { id: 'sched-maintenance', label: 'Scheduled Maintenance', icon: Calendar },
                { id: 'data-tools', label: 'Data Integrity Tools', icon: Database },
                { id: 'budget-tracker', label: 'Budget & Actuals', icon: BarChart3 },
                { id: 'dividend-engine', label: 'Dividend Engine', icon: Zap },
                { id: 'navigation-manager', label: 'Strategic Navigation', icon: Map },
                { id: 'member-lifecycle', label: 'Member Lifecycle Intelligence', icon: ActivityIcon },
                { id: 'settlement-auth', label: 'Settlement Authorization', icon: ShieldCheck },
                { id: 'financial-governance', label: 'Financial Governance', icon: Banknote },
                { id: 'welfare-intelligence', label: 'Welfare Intelligence', icon: LifeBuoy },
                { id: 'visual-customizer', label: 'Visual UI Customizer', icon: Layout },
                { id: 'portal-config', label: 'Portal Settings', icon: Eye },
                { id: 'content-labels', label: 'Content & Labels', icon: Edit3 },
                { id: 'brand-identity', label: 'Brand Identity', icon: Image },
                { id: 'config-history', label: 'Configuration Audit', icon: Clock }
            ]
        }
    ];

    const menu = sections.flatMap(s => s.items);

    if (loading && !perfMetrics && !unifiedSummary && admins.length === 0) return <div style={{ padding: '6rem', textAlign: 'center' }}><RefreshCw className="spin text-accent" size={48} /></div>;
    if (error) return <div className="page-load toast-error" style={{ margin: '4rem auto', maxWidth: 600 }}>{error}</div>;

    const summary = unifiedSummary || { health: {}, security: {}, maintenance: {} };

    return (
        <div className="system-control-page" style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div style={{ width: 48, height: 48, background: 'var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                        <Terminal size={24} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0, letterSpacing: '-1px' }}>ICT Command Center</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0, opacity: 0.8 }}>LLUCG Infrastructure Governance & Security Management Portal.</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'flex-start' }}>
                {/* --- SIDEBAR NAVIGATION --- */}
                <div style={{ width: '320px', flexShrink: 0, position: 'sticky', top: '2rem' }}>
                    {sections.map((section, sIdx) => (
                        <div key={section.title} style={{ marginBottom: '2.5rem' }}>
                            <h4 style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: 800, 
                                color: 'var(--text-dim)', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1.5px',
                                marginBottom: '1.25rem',
                                paddingLeft: '0.5rem'
                            }}>
                                {section.title}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {section.items.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleTabChange(item.id)}
                                        className={`nav-link ${tab === item.id ? 'active' : ''}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.85rem',
                                            padding: '0.85rem 1.25rem',
                                            width: '100%',
                                            textAlign: 'left',
                                            background: tab === item.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                                            color: tab === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                                            border: 'none',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            fontWeight: tab === item.id ? 700 : 500,
                                            fontSize: '0.9rem',
                                            borderLeft: tab === item.id ? '3px solid var(--accent)' : '3px solid transparent'
                                        }}
                                    >
                                        <item.icon size={18} strokeWidth={tab === item.id ? 2.5 : 2} />
                                        <span>{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* --- MAIN CONTENT AREA --- */}
                <div style={{ flex: 1, minWidth: 0 }}>

            <div style={{ minHeight: '600px' }}>
                <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                            
                            {/* --- HEALTH TAB --- */}
                        {tab === 'system-health' && (
                                <div>
                                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                                        <StatCard label="Database Volume" value={summary.health.dbSize || '--'} sub="SQLite Binary size" color="#3b82f6" icon={Database} />
                                        <StatCard label="Audit Footprint" value={summary.health.totalLogs?.toLocaleString() || '--'} sub="Forensic entries" color="#8b5cf6" icon={Filter} />
                                        <StatCard label="System Liquidity" value={`KES ${summary.health.systemLiquidity?.toLocaleString() || '0'}`} sub="Available SACCO Cash" color="#10b981" icon={DollarSign} />
                                        <StatCard label="Memory Load" value={`${summary.health.memoryPct || 0}%`} sub="Heap utilization" color="#f59e0b" icon={Activity} />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div className="card shadow-sm">
                                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}><CheckCircle2 size={20} className="text-success" /> Infrastructure Status</h3>
                                            <div style={{ padding: '1.5rem', background: 'var(--bg-body)', borderRadius: 12, textAlign: 'left' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}><span>Gateway Resilience:</span> <span style={{ color: 'var(--success)', fontWeight:700 }}>HIGH</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}><span>Auth Micro-service:</span> <span style={{ color: 'var(--success)', fontWeight:700 }}>HEALTHY</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SMS Gateway Port:</span> <span style={{ color: 'var(--success)', fontWeight:700 }}>OPEN</span></div>
                                            </div>
                                        </div>
                                        <div className="card shadow-sm">
                                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Smartphone size={20} className="text-accent" /> Active Access</h3>
                                            <div style={{ padding: '1.5rem', background: 'var(--bg-body)', borderRadius: 12 }}>
                                                <h4 style={{ fontSize: '2rem', margin: 0 }}>{summary.security.activeSessions || 0}</h4>
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Concurrent authenticated sessions across all portals.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- LOGS TAB (PREMIUM) --- */}
                        {(tab === 'live-console' || tab === 'logs') && (
                                <div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Terminal size={24} className="text-accent" /> Kernel Event Stream</h2>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.3rem' }}>Authenticated WebSocket connection to backend console output.</p>
                                    </div>
                                    <LiveLogConsole />
                                </div>
                            )}

                            {/* --- ADMINS TAB --- */}
                            {tab === 'admins' && (
                                <div>
                                    <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Shield size={24} className="text-accent" /> Technical Access Management</h2>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.3rem' }}>Managing identities with elevated system privileges.</p>
                                        </div>
                                        <button className="btn btn-primary" onClick={() => setShowAddAdmin(true)}><Plus size={18} /> Provision Admin</button>
                                    </div>

                                    {editingAdmin && (
                                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card shadow-sm" style={{ marginBottom: '2rem', border: '2px solid var(--accent)', background: 'var(--bg-card)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Edit3 size={20} /> Identity Reconfiguration</h3>
                                                <button className="btn btn-ghost" onClick={() => setEditingAdmin(null)}><X size={20} /></button>
                                            </div>
                                            <form onSubmit={handleUpdateAdmin} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                                <div className="form-group"><label>Identity Tag (Username)</label><input className="input" style={{ width: '100%' }} value={editForm.username} onChange={e => setEditForm({...editForm, username: e.target.value})} placeholder="e.g. jdoe_admin" /></div>
                                                <div className="form-group">
                                                    <label>Functional Title (Custom)</label>
                                                    <input className="input" style={{ width: '100%' }} value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="e.g. Lead ICT Officer" />
                                                </div>
                                                <div className="form-group">
                                                    <label>Permission Layer (Security Role)</label>
                                                    <select className="input" style={{ width: '100%' }} value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})}>
                                                        <option value="superadmin">Super Admin</option>
                                                        <option value="ict_admin">ICT Admin</option>
                                                        <option value="finance_admin">Finance Admin</option>
                                                        <option value="treasurer">Treasurer</option>
                                                        <option value="secretary">Secretary</option>
                                                        <option value="staff">Staff / Clerk</option>
                                                        <option value="admin">Standard Admin</option>
                                                    </select>
                                                </div>
                                                <div className="form-group"><label>Alert Phone</label><input className="input" style={{ width: '100%' }} value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} /></div>
                                                <div className="form-group"><label>Email Address</label><input className="input" type="email" style={{ width: '100%' }} value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} /></div>
                                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
                                                    <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }} disabled={busyId === editingAdmin.id}>
                                                        {busyId === editingAdmin.id ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Commit Updates
                                                    </button>
                                                    <button type="button" className="btn btn-ghost" onClick={() => setEditingAdmin(null)}>Abandon Changes</button>
                                                </div>
                                            </form>
                                        </motion.div>
                                    )}

                                    <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
                                        <table className="table">
                                            <thead style={{ background: 'var(--bg-body)' }}>
                                                <tr><th>Identity</th><th>Access Layer</th><th>Last Activity</th><th style={{ textAlign: 'right' }}>Protocols</th></tr>
                                            </thead>
                                            <tbody>
                                                {admins.map(admin => (
                                                    <tr key={admin.id} style={{ opacity: editingAdmin?.id === admin.id ? 0.3 : 1, transition: 'opacity 0.3s' }}>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.9rem' }}>{admin.username[0].toUpperCase()}</div>
                                                                <div>
                                                                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>{admin.username}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>UID: {admin.id.toString().padStart(4, '0')}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{admin.title || 'Administrative Principal'}</div>
                                                            <div style={{ fontSize: '0.65rem' }}><span className="badge badge-accent-outline" style={{ textTransform: 'uppercase', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>{admin.role}</span></div>
                                                        </td>
                                                        <td><span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{admin.updatedAt ? new Date(admin.updatedAt).toLocaleDateString() : 'Active Now'}</span></td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                                <button className="btn btn-ghost btn-sm" title="Reconfigure" onClick={() => startEditAdmin(admin)}><Edit3 size={16} /></button>
                                                                <button className="btn btn-ghost btn-sm" title="Reset Credentials" onClick={() => setResetAdmin(admin)}><Key size={16} /></button>
                                                                <button className="btn btn-ghost btn-sm text-danger" title="Purge Account" onClick={() => setDeleteAdmin(admin)}><Trash2 size={16} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- PERFORMANCE TAB --- */}
                            {tab === 'performance' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Cpu size={24} className="text-accent" /> Kernel Metrics</h2>
                                    {!perfMetrics ? <div style={{ textAlign: 'center', padding: '6rem' }}><RefreshCw className="spin text-accent" size={32} /></div> : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                                            <div className="card shadow-md" style={{ background: '#111827', border: '1px solid #374151' }}>
                                                <h4 style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 800, marginBottom: '1rem' }}>MEMORY DUMP</h4>
                                                <div style={{ height: 8, background: '#1f2937', borderRadius: 4, marginBottom: '1rem', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${(perfMetrics.memoryUsedMB/perfMetrics.memoryLimitMB)*100}%`, background: '#6366f1' }} />
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 900, color: '#f3f4f6' }}>
                                                    <span>{perfMetrics.memoryUsedMB} <small style={{ fontSize: '0.65rem', fontWeight: 500, color: '#6b7280' }}>MB</small></span>
                                                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>/ {perfMetrics.memoryLimitMB} MB</span>
                                                </div>
                                            </div>
                                            <StatCard label="DB Registry" value={perfMetrics.dbSizeMB + ' MB'} sub="Physical disk space" color="var(--warning)" icon={Database} />
                                            <StatCard label="Traffic (1h)" value={perfMetrics.recentApiCalls} sub="Gateway through-put" color="#8b5cf6" icon={TrendingUp} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- HEALTH CHECKER TAB --- */}
                            {tab === 'health-checker' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><ShieldCheck size={24} className="text-accent" /> Integration Integrity Lab</h2>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Deep-packet inspection of critical system dependencies.</p>
                                        </div>
                                        <button className="btn btn-primary" onClick={runHealthCheck} disabled={hcResults?.status === 'running'}>
                                            <RefreshCw size={18} className={hcResults?.status === 'running' ? 'spin' : ''} /> Run Diagnostics
                                        </button>
                                    </div>

                                    {!hcResults ? <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>Diagnostic engine standby.</div> : (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                            <div className="card shadow-sm" style={{ gridColumn: '1 / -1', borderLeft: `4px solid ${hcResults.status === 'healthy' ? 'var(--success)' : 'var(--danger)'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Overall Verdict: <span style={{ color: hcResults.status === 'healthy' ? 'var(--success)' : 'var(--danger)', textTransform: 'uppercase' }}>{hcResults.status}</span></h4>
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Last run: {new Date(hcResults.ts).toLocaleString()}</p>
                                                    </div>
                                                    <div style={{ fontSize: '2rem', filter: 'grayscale(1)' }}>{hcResults.status === 'healthy' ? '✅' : '⚠️'}</div>
                                                </div>
                                            </div>
                                            {hcResults.checks.map((c, i) => (
                                                <div key={i} className="card shadow-sm" style={{ background: 'var(--bg-body)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{c.name}</span>
                                                        <span className={`badge ${c.status === 'pass' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>{c.status.toUpperCase()}</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{c.desc}</p>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                                        <code style={{ color: 'var(--accent)' }}>{c.message}</code>
                                                        <span style={{ opacity: 0.5 }}>{c.ms}ms</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- FINANCIAL GOVERNANCE TAB --- */}
                            {tab === 'financial-governance' && (
                                <div>
                                    <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Banknote size={24} className="text-accent" /> Strategic Financial Governance</h2>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Centralized control for all SACCO fees, contributions, and penalty logic.</p>
                                        </div>
                                        <button className="btn btn-ghost" onClick={() => { fetchPortalSettings(); fetchSettingsAudit(); fetchGovFunds(); }}><RefreshCw size={18} /></button>
                                    </div>

                                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                                        <StatCard label="System Liquidity" value={`KES ${govFunds.systemLiquidity?.toLocaleString() || '0'}`} sub="Available SACCO Cash" color="#10b981" icon={DollarSign} />
                                        <StatCard label="Total Institutional" value={`KES ${(govFunds.registrationFees + govFunds.welfareFund + govFunds.penaltiesCollected).toLocaleString()}`} sub="Non-Savings Capital" color="#8b5cf6" icon={PieChart} />
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
                                                    { key: 'late_fee_amount', label: 'Standard Late Fee', icon: AlertTriangle },
                                                    { key: 'auto_penalty_amount', label: 'Automated Penalty Amount', icon: Gavel },
                                                    { key: 'auto_penalty_days_overdue', label: 'Trigger Days Overdue', icon: Clock },
                                                    { key: 'penalty_grace_period', label: 'Grace Period (Days)', icon: Calendar },
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

                                    {/* 4. Advanced Financial Governance Reporting */}
                                    <div className="card shadow-lg" style={{ marginBottom: '3rem', borderLeft: '4px solid var(--accent)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                            <div>
                                                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '0.25rem' }}>Strategic Financial Reporting</h3>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Download consolidated reports regarding the exact health of the 4 individual funds.</p>
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
                                                                <td style={{ fontWeight: 800 }}><code>{a.setting_key}</code></td>
                                                                <td style={{ color: 'var(--text-dim)' }}>{a.old_value || 'NULL'}</td>
                                                                <td style={{ fontWeight: 800, color: 'var(--success)' }}>{a.new_value}</td>
                                                                <td><span className="badge badge-ghost">{a.changed_by}</span></td>
                                                                <td style={{ fontSize: '0.75rem' }}>{new Date(a.changed_at).toLocaleString()}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- MEMBER LIFECYCLE TAB --- */}
                            {tab === 'member-lifecycle' && (
                                <div className="animate-in">
                                    <MemberLifecycle />
                                </div>
                            )}

                            {/* --- CRON JOBS TAB --- */}
                            {tab === 'cron-jobs' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><RefreshCw size={24} className="text-accent" /> Scheduled Automated Tasks</h2>
                                        <button className="btn btn-ghost" onClick={fetchCrons}><RefreshCw size={18} /></button>
                                    </div>
                                    <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                                        <table className="table">
                                            <thead style={{ background: 'var(--bg-body)' }}>
                                                <tr><th>Task Logic</th><th>Frequency</th><th>Last Execution</th><th style={{ textAlign: 'right' }}>Ops Control</th></tr>
                                            </thead>
                                            <tbody>
                                                {cronJobs.map(j => (
                                                    <tr key={j.id}>
                                                        <td>
                                                            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{j.name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{j.desc}</div>
                                                        </td>
                                                        <td><code style={{ background: 'var(--bg-body)', padding: '0.2rem 0.4rem', borderRadius: 4 }}>{j.schedule}</code></td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: j.lastStatus === 'success' ? 'var(--success)' : 'var(--danger)' }} />
                                                                <span style={{ fontSize: '0.8rem' }}>{j.lastRun ? new Date(j.lastRun).toLocaleString() : 'Never'}</span>
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginLeft: '1.1rem' }}>{j.lastMsg}</div>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <button className="btn btn-sm btn-primary" onClick={() => triggerCron(j.id)} disabled={busyId === j.id}>
                                                                {busyId === j.id ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} Force Run
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- ERROR LOGS TAB --- */}
                            {tab === 'error-logs' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Bug size={24} className="text-danger" /> Kernel Error Trace</h2>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Recent application-level crashes and warning signals.</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <button className="btn btn-ghost" onClick={fetchErrorLogs}><RefreshCw size={18} /></button>
                                            <button className="btn btn-danger" onClick={clearErrorLogs}><Trash2 size={18} /> Clear Log</button>
                                        </div>
                                    </div>
                                    <div className="card shadow-sm" style={{ background: '#0b0e14', color: '#f87171', border: '1px solid #334155', padding: '1rem', fontFamily: 'monospace', fontSize: '0.8rem', minHeight: '300px' }}>
                                        {errorLogs.length === 0 ? <div style={{ textAlign: 'center', color: '#475569', marginTop: '2rem' }}>No errors detected in the current buffer.</div> : (
                                            errorLogs.map((log, i) => (
                                                <div key={i} style={{ marginBottom: '0.6rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.4rem' }}>
                                                    <span style={{ color: '#64748b', marginRight: '0.5rem' }}>[{new Date(log.ts).toLocaleString()}]</span>
                                                    <span style={{ fontWeight: 800, marginRight: '0.5rem' }}>{log.level.toUpperCase()}</span>
                                                    <span style={{ opacity: 0.6, marginRight: '0.5rem' }}>@{log.source}:</span>
                                                    <span style={{ color: '#e2e8f0' }}>{log.msg}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* --- ANNOUNCEMENTS TAB --- */}
                            {tab === 'admin-alerts' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Megaphone size={24} className="text-accent" /> Administrative Alerts & Popups</h2>
                                        <button 
                                            className="btn btn-ghost text-danger" 
                                            onClick={() => { if(window.confirm('Kill all active broadcasts immediately?')) { setAnnForm({...annForm, enabled: false}); saveAnnouncement({ preventDefault: () => {} }); }}}
                                            style={{ border: '1px solid var(--danger-dim)', borderRadius: 8, fontSize: '0.75rem' }}
                                        >
                                            <Power size={14} /> Kill Active Broadcast
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
                                        <form onSubmit={saveAnnouncement} className="card shadow-lg" style={{ border: '1px solid var(--border)' }}>
                                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <label>Broadcast Status</label>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <input type="checkbox" checked={annForm.enabled} onChange={e => setAnnForm({...annForm, enabled: e.target.checked})} />
                                                        <span style={{ fontSize: '0.85rem' }}>Active on Member Dashboard</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                <label>Alert Severity</label>
                                                <select className="input" value={annForm.severity} onChange={e => setAnnForm({...annForm, severity: e.target.value})}>
                                                    <option value="info">🔵 Blue (Information)</option>
                                                    <option value="success">🟢 Green (Success/Update)</option>
                                                    <option value="warning">🟠 Orange (Caution/Maintenance)</option>
                                                    <option value="danger">🔴 Red (Critical/Alert)</option>
                                                </select>
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                <label>Message Content (Custom Popup)</label>
                                                <textarea 
                                                    className="input" 
                                                    style={{ width: '100%', minHeight: 120, fontSize: '0.9rem' }} 
                                                    value={annForm.message} 
                                                    onChange={e => setAnnForm({...annForm, message: e.target.value})} 
                                                    placeholder="Type your custom broadcast message here..." 
                                                    required 
                                                />
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                                <label>Expiry Date/Time (Optional)</label>
                                                <input type="datetime-local" className="input" value={annForm.expiresAt || ''} onChange={e => setAnnForm({...annForm, expiresAt: e.target.value})} />
                                            </div>

                                            <button className="btn btn-primary" type="submit" disabled={busyId === 'saving_ann'} style={{ width: '100%', padding: '1rem' }}>
                                                {busyId === 'saving_ann' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Update Global Broadcast
                                            </button>
                                        </form>

                                        <div className="card shadow-md" style={{ background: 'var(--bg-secondary)', height: 'fit-content' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={16} /> Quick Presets</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {[
                                                    { label: 'System Update', msg: 'System Modernization Complete. New features have been deployed.', sev: 'success' },
                                                    { label: 'Scheduled Maintenance', msg: 'The portal will be undergoing maintenance tonight from 10 PM.', sev: 'warning' },
                                                    { label: 'Service Interruption', msg: 'We are currently experiencing a brief delay in SMS delivery.', sev: 'danger' },
                                                    { label: 'General Welcome', msg: 'Welcome to the LLUCG Sacco Member Portal!', sev: 'info' }
                                                ].map((p, idx) => (
                                                    <button 
                                                        key={idx}
                                                        type="button"
                                                        className="btn btn-ghost" 
                                                        style={{ textAlign: 'left', fontSize: '0.75rem', justifyContent: 'flex-start', padding: '0.75rem', border: '1px solid var(--border)' }}
                                                        onClick={() => setAnnForm({...annForm, message: p.msg, severity: p.sev, enabled: true})}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- SESSIONS TAB --- */}
                            {tab === 'active-sessions' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Smartphone size={24} className="text-success" /> Live Authenticated Sessions</h2>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead><tr><th>Principal</th><th>Asset/Device</th><th>Authenticated At</th><th style={{ textAlign: 'right' }}>Security Ops</th></tr></thead>
                                            <tbody>
                                                {sessions.length === 0 ? <tr className="empty-row"><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>Grid idle. No active principals.</td></tr> : (
                                                    sessions.map(s => (
                                                        <tr key={s.id}>
                                                            <td>
                                                                <div style={{ fontWeight: 800 }}>{s.name}</div>
                                                                <div style={{ fontSize: '0.75rem' }} className="badge badge-accent-outline">{s.type.toUpperCase()}</div>
                                                            </td>
                                                            <td><div style={{ fontSize: '0.85rem' }}>{s.userAgent?.split(')')[0]?.substring(0, 40) || 'Unknown Client'}...</div></td>
                                                            <td><span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{new Date(s.createdAt).toLocaleString()}</span></td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <button className="btn btn-sm btn-ghost text-danger" onClick={() => revokeSession(s.id, s.type)} disabled={busyId === s.id}>
                                                                    {busyId === s.id ? <RefreshCw size={14} className="spin" /> : <Power size={14} />} Terminate
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- RATE LIMITS TAB --- */}
                            {(tab === 'rate-limits' || tab === 'security-limits') && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <ShieldAlert size={24} className="text-warning" /> Traffic & Velocity Control
                                        </h2>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                                        <form onSubmit={saveRateLimits} className="card shadow-lg" style={{ border: '1px solid var(--border)' }}>
                                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                <label>Global API Rate Limit (Requests / 15min)</label>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    value={rateLimits.global} 
                                                    onChange={e => setRateLimits({...rateLimits, global: parseInt(e.target.value)})}
                                                />
                                            </div>

                                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                                <label>Auth Velocity Limit (Login Attempts / 15min)</label>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    value={rateLimits.auth} 
                                                    onChange={e => setRateLimits({...rateLimits, auth: parseInt(e.target.value)})}
                                                />
                                            </div>

                                            <button className="btn btn-primary" type="submit" disabled={busyId === 'saving_rate'} style={{ width: '100%' }}>
                                                {busyId === 'saving_rate' ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />} Commit & Sync Limits
                                            </button>
                                        </form>
                                        
                                        <div className="card shadow-sm" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                            <h4 style={{ fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={16} /> Operational Impact</h4>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                                                Changes to these limits propagate across the entire ICT cluster within 60 seconds. 
                                                High limits may increase vulnerability to DDoS, while low limits may disrupt legitimate member traffic.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- ADMINS TAB --- */}
                            {tab === 'admins' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Shield size={24} className="text-accent" /> Administrative Accounts</h2>
                                        <button className="btn btn-primary" onClick={() => setShowAddAdmin(true)}>Add Administrator</button>
                                    </div>
                                    <div className="card shadow-md" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Administrator</th>
                                                    <th>Role</th>
                                                    <th style={{ textAlign: 'right' }}>Operations</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {admins.map(a => (
                                                    <tr key={a.id}>
                                                        <td>
                                                            <div style={{ fontWeight: 800 }}>{a.username}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{a.email || 'No email'}</div>
                                                        </td>
                                                        <td><span className="badge badge-ghost">{a.role}</span></td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => startEditAdmin(a)}>Edit</button>
                                                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDeleteAdmin(a)}>Purge</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- AUDIT TAB --- */}
                            {(tab === 'audit' || tab === 'full-audit-trail') && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><ClipboardList size={24} className="text-success" /> System Audit Trail</h2>
                                        <button className="btn btn-primary btn-sm" onClick={() => downloadBlob('/api/system/audit/export.pdf', 'audit.pdf')}>
                                            <Download size={14} /> Export PDF
                                        </button>
                                    </div>
                                    <div className="card shadow-md" style={{ padding: 0, maxHeight: '600px', overflowY: 'auto' }}>
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Action</th>
                                                    <th>By</th>
                                                    <th>Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {auditLogs.length === 0 ? <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No logs found for this period.</td></tr> : auditLogs.map(l => (
                                                    <tr key={l.id}>
                                                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(l.timestamp).toLocaleString()}</td>
                                                        <td><span className="badge badge-ghost" style={{ fontSize: '0.7rem' }}>{l.action}</span></td>
                                                        <td style={{ fontWeight: 700 }}>{l.performed_by}</td>
                                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{l.details}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- CONTENT LABELS --- */}

                            {/* --- VERIFICATION CODES TAB --- */}
                            {tab === 'verification-codes' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Key size={24} className="text-accent" /> Active OTP Intercept</h2>
                                        <button className="btn btn-ghost" onClick={fetchResets} disabled={busyId === 'fetching_resets'}>
                                            <RefreshCw className={busyId === 'fetching_resets' ? 'spin' : ''} size={18} />
                                        </button>
                                    </div>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead><tr><th>Recipient</th><th>Protocol</th><th>Intercepted Code</th><th>Expiry Signal</th></tr></thead>
                                            <tbody>
                                                {resets.length === 0 ? <tr className="empty-row"><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No active verification codes in transit.</td></tr> : (
                                                    resets.map(r => (
                                                        <tr key={r.id}>
                                                            <td>
                                                                <div style={{ fontWeight: 800 }}>{r.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.phone}</div>
                                                            </td>
                                                            <td><span className="badge badge-accent">{r.type}</span></td>
                                                            <td><code style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '0.1em', background: 'var(--bg-body)', padding: '0.2rem 1rem', borderRadius: 8 }}>{r.code}</code></td>
                                                            <td><span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{new Date(r.expiry).toLocaleTimeString()}</span></td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- GLOBAL AUDIT TAB --- */}
                            {tab === 'full-audit-trail' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><ClipboardList size={24} className="text-yellow" /> Forensic Activity Ledger</h2>
                                        <a href={`/api/system/audit/export.pdf?token=${localStorage.getItem('mp_token')}`} className="btn btn-primary btn-sm"><Download size={14} /> Export PDF Evidence</a>
                                    </div>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table" style={{ fontSize: '0.85rem' }}>
                                            <thead><tr><th>Timestamp</th><th>Action</th><th>Subject</th><th>Details</th><th>Principal</th></tr></thead>
                                            <tbody>
                                                {globalAudit.map(log => (
                                                    <tr key={log.id}>
                                                        <td style={{ opacity: 0.5 }}>{new Date(log.timestamp).toLocaleString()}</td>
                                                        <td style={{ fontWeight: 800 }}>{log.action}</td>
                                                        <td><span className="badge badge-accent">{log.entity}</span></td>
                                                        <td><div style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.details}>{log.details}</div></td>
                                                        <td style={{ fontWeight: 600 }}>{log.performed_by}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- SMS GATEWAY TAB --- */}
                            {tab === 'sms-gateway' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Smartphone size={24} className="text-accent" /> High-Throughput SMS Gateway</h2>
                                    <form onSubmit={saveSmsGateway} className="card shadow-lg" style={{ maxWidth: 600 }}>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label>Service Provider (Primary)</label>
                                            <select className="input" value={smsCfg.provider} onChange={e => setSmsCfg({...smsCfg, provider: e.target.value})}>
                                                <option value="africastalking">Africa's Talking (KAPU API)</option>
                                                <option value="twillio">Twilio (International)</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label>API Username (Identity Tag)</label>
                                            <input className="input" value={smsCfg.username} onChange={e => setSmsCfg({...smsCfg, username: e.target.value})} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label>Production API Key</label>
                                            <input className="input" type="password" value={smsCfg.apiKey} onChange={e => setSmsCfg({...smsCfg, apiKey: e.target.value})} />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                                            <label>Shortcode / Sender ID</label>
                                            <input className="input" value={smsCfg.senderId} onChange={e => setSmsCfg({...smsCfg, senderId: e.target.value})} placeholder="e.g. LLUCG_SACCO" />
                                        </div>
                                        <button className="btn btn-primary" type="submit" disabled={busyId === 'saving_sms_gw'} style={{ width: '100%', padding: '1rem' }}>
                                            {busyId === 'saving_sms_gw' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Synchronize Provider Settings
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* --- PORTAL CONFIG TAB --- */}
                            {tab === 'portal-config' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><SettingsIcon size={24} className="text-accent" /> High-Level Portal Logic Flags</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                        {[
                                            { key: 'mfa_required', label: 'Mandatory Admin MFA', desc: 'Require TOTP for all accounts with "admin" role.' },
                                            { key: 'member_registration', label: 'Public Registration', desc: 'Allow members to create accounts without admin pre-approval.' },
                                            { key: 'loan_requests', label: 'Loan Application Logic', desc: 'Enable the digital loan request pipeline for members.' },
                                            { key: 'maintenance_mode', label: 'Hard Maintenance Mode', desc: 'Globally freeze the portal and show the maintenance screen.' },
                                            { key: 'audit_log_visibility', label: 'Audit Log Exposure', desc: 'Allow managers to view global activity logs.' },
                                        ].map(f => (
                                            <div key={f.key} className="card shadow-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <h4 style={{ fontWeight: 800 }}>{f.label}</h4>
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f.desc}</p>
                                                </div>
                                                <button 
                                                    className={`btn ${portalCfg[f.key] === 'true' ? 'btn-success' : 'btn-ghost'}`} 
                                                    onClick={() => toggleConfig(f.key, portalCfg[f.key])}
                                                    style={{ border: portalCfg[f.key] === 'true' ? 'none' : '1px solid var(--border)' }}
                                                >
                                                    {portalCfg[f.key] === 'true' ? <Unlock size={18} /> : <Lock size={18} />}
                                                </button>
                                            </div>
                                        ))}

                                        {/* Universal Theme Mode Card */}
                                        <div className="card shadow-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
                                            <div>
                                                <h4 style={{ fontWeight: 800 }}>Universal Theme Mode</h4>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Force light or dark theme globally across all portals.</p>
                                            </div>
                                            <button 
                                                className={`btn ${portalCfg.theme_light_mode === 'true' ? 'btn-warning' : 'btn-primary'}`} 
                                                onClick={() => toggleConfig('theme_light_mode', portalCfg.theme_light_mode)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, padding: '8px 16px', borderRadius: '8px', border: 'none' }}
                                            >
                                                {portalCfg.theme_light_mode === 'true' ? <Sun size={18} /> : <Moon size={18} />}
                                                {portalCfg.theme_light_mode === 'true' ? 'Light Theme' : 'Dark Theme'}
                                            </button>
                                        </div>

                                        {/* Allow Member Theme Toggle Card */}
                                        <div className="card shadow-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
                                            <div>
                                                <h4 style={{ fontWeight: 800 }}>Allow Member Theme Selection</h4>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Enable dark/light toggles in headers for user customization.</p>
                                            </div>
                                            <button 
                                                className={`btn ${portalCfg.allow_user_theme_toggle === 'true' ? 'btn-success' : 'btn-ghost'}`} 
                                                onClick={() => toggleConfig('allow_user_theme_toggle', portalCfg.allow_user_theme_toggle)}
                                                style={{ border: portalCfg.allow_user_theme_toggle === 'true' ? 'none' : '1px solid var(--border)' }}
                                            >
                                                {portalCfg.allow_user_theme_toggle === 'true' ? <Unlock size={18} /> : <Lock size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '3.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Award size={20} className="text-yellow" /> Pledge & Commitment Policy</h3>
                                    <div className="card shadow-md" style={{ maxWidth: 800, border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                                            <div className="form-group">
                                                <label style={{ fontWeight: 800, marginBottom: '0.6rem', display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>PLEDGE COMMITMENT FEE (KES)</label>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700 }}
                                                    value={portalCfg.pledge_fee || ''} 
                                                    onChange={e => setPortalCfg({...portalCfg, pledge_fee: e.target.value})}
                                                    placeholder="100"
                                                />
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.75rem', lineHeight: 1.4 }}>The penalty amount automatically applied to a member's account when they apply for a contribution extension.</p>
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontWeight: 800, marginBottom: '0.6rem', display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>EXTENSION DURATION (DAYS)</label>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700 }}
                                                    value={portalCfg.pledge_duration || ''} 
                                                    onChange={e => setPortalCfg({...portalCfg, pledge_duration: e.target.value})}
                                                    placeholder="14"
                                                />
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.75rem', lineHeight: 1.4 }}>Number of days to extend the next contribution deadline by (e.g. 7, 14, or 30 days).</p>
                                            </div>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ fontWeight: 800, marginBottom: '0.6rem', display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>RESEND EMAIL API KEY</label>
                                                <div style={{ position: 'relative' }}>
                                                    <input 
                                                        type="password" 
                                                        className="input" 
                                                        style={{ width: '100%', fontSize: '1rem', paddingRight: '3rem' }}
                                                        value={portalCfg.cred_resend_apikey || ''} 
                                                        onChange={e => setPortalCfg({...portalCfg, cred_resend_apikey: e.target.value})}
                                                        placeholder="re_..."
                                                    />
                                                    <button type="button" onClick={() => setShowApi(!showApi)} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                                                        {showApi ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </button>
                                                </div>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>Used for sending verification codes via email. Get one at resend.com.</p>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '2.5rem', padding: '1.25rem', background: 'var(--bg-body)', borderRadius: 12, border: '1px dashed var(--border)', marginBottom: '2rem' }}>
                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                <strong>Current Logic:</strong> When a member applies, their <code>nextDueDate</code> is incremented by <strong>{portalCfg.pledge_duration || 14} days</strong> and a penalty of <strong>KES {portalCfg.pledge_fee || 100}</strong> is issued.
                                            </p>
                                        </div>
                                        <button 
                                            className="btn btn-primary" 
                                            style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                            onClick={() => saveConfig({ pledge_fee: portalCfg.pledge_fee, pledge_duration: portalCfg.pledge_duration, cred_resend_apikey: portalCfg.cred_resend_apikey })}
                                            disabled={busyId === 'saving_cfg'}
                                        >
                                            {busyId === 'saving_cfg' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Update Commitment Rules
                                        </button>
                                    </div>

                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '3.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Banknote size={20} className="text-accent" /> Global Loan Interest Policy</h3>
                                    <div className="card shadow-md" style={{ maxWidth: 800, border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                                            <div className="form-group">
                                                <label style={{ fontWeight: 800, marginBottom: '0.6rem', display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>DEFAULT INTEREST RATE (%)</label>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700 }}
                                                    value={portalCfg.default_loan_interest_rate || ''} 
                                                    onChange={e => setPortalCfg({...portalCfg, default_loan_interest_rate: e.target.value})}
                                                    placeholder="1"
                                                />
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.75rem', lineHeight: 1.4 }}>The monthly interest rate applied to active loans by the automation engine.</p>
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontWeight: 800, marginBottom: '0.6rem', display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CALCULATION METHOD</label>
                                                <select 
                                                    className="input" 
                                                    style={{ width: '100%', fontWeight: 700 }}
                                                    value={portalCfg.default_loan_interest_type || 'flat'} 
                                                    onChange={e => setPortalCfg({...portalCfg, default_loan_interest_type: e.target.value})}
                                                >
                                                    <option value="flat">Flat Rate (On original principal)</option>
                                                    <option value="reducing">Reducing Balance (On remaining debt)</option>
                                                </select>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.75rem', lineHeight: 1.4 }}>Determines how monthly interest accruals are calculated.</p>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '2.5rem', padding: '1.25rem', background: 'var(--bg-body)', borderRadius: 12, border: '1px dashed var(--border)', marginBottom: '2rem' }}>
                                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                <strong>Current Logic:</strong> New loans will default to <strong>{portalCfg.default_loan_interest_rate || 1}%</strong> interest using <strong>{portalCfg.default_loan_interest_type === 'reducing' ? 'Reducing Balance' : 'Flat Rate'}</strong> logic.
                                            </p>
                                        </div>
                                        <button 
                                            className="btn btn-primary" 
                                            style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                            onClick={() => saveConfig({ default_loan_interest_rate: portalCfg.default_loan_interest_rate, default_loan_interest_type: portalCfg.default_loan_interest_type })}
                                            disabled={busyId === 'saving_cfg'}
                                        >
                                            {busyId === 'saving_cfg' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Update Interest Policy
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* --- ACCESS GOVERNANCE TAB --- */}
                            {tab === 'access-governance' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><CheckCircle2 size={24} className="text-accent" /> RBAC Layer Governance</h2>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead><tr><th>System Role</th><th>Access Logic (Permissions)</th><th>Coverage</th></tr></thead>
                                            <tbody>
                                                {rbac.roles.map(r => (
                                                    <tr key={r.id}>
                                                        <td style={{ fontWeight: 800 }}>{r.name.toUpperCase()}</td>
                                                        <td>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                                {r.permissions.map(p => <span key={p} className="badge badge-accent-outline" style={{ fontSize: '0.65rem' }}>{p}</span>)}
                                                            </div>
                                                        </td>
                                                        <td style={{ fontWeight: 600 }}>{r.count} Identities</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- CREDENTIALS TAB --- */}
                            {tab === 'credentials' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Lock size={24} className="text-accent" /> Strategic Credential Vault</h2>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead><tr><th>Dependency/Service</th><th>Encrypted Key</th><th>Last Rotation</th></tr></thead>
                                            <tbody>
                                                {vault.map(v => (
                                                    <tr key={v.id}>
                                                        <td style={{ fontWeight: 800 }}>{v.service}</td>
                                                        <td><code style={{ fontSize: '0.8rem', opacity: 0.5 }}>****************************{v.keyTail}</code></td>
                                                        <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{new Date(v.rotatedAt).toLocaleDateString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- SMS TEMPLATES TAB --- */}
                            {tab === 'sms-templates' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><MessageSquare size={24} className="text-accent" /> SMS Logic Templates</h2>
                                        <button className="btn btn-primary" onClick={saveSmsTemplates} disabled={busyId === 'saving_sms'}>
                                            {busyId === 'saving_sms' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Sync Templates
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                        {Object.entries(smsTpl?.templates || {}).map(([key, val]) => (
                                            <div key={key} className="card shadow-sm">
                                                <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block', color: 'var(--text-secondary)' }}>{key.replace(/_/g, ' ')}</label>
                                                <textarea 
                                                    className="input" 
                                                    style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                    value={val}
                                                    onChange={e => setSmsTpl(prev => ({...prev, templates: {...(prev?.templates || {}), [key]: e.target.value}}))}
                                                />
                                            </div>
                                        ))}
                                        {Object.keys(smsTpl?.templates || {}).length === 0 && (
                                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No templates found or system is offline.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* --- SECURITY RECOVERY TAB --- */}
                            {tab === 'security-recovery' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><ShieldAlert size={24} className="text-danger" /> Threat Mitigation & Recovery</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                                        <div className="card shadow-sm" style={{ padding: 0 }}>
                                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 800 }}>Locked Identites (Brute-force Containment)</div>
                                            <table className="table">
                                                <tbody>
                                                    {lockedUsers.length === 0 ? <tr className="empty-row"><td style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No identities currently in containment.</td></tr> : (
                                                        lockedUsers.map(u => (
                                                            <tr key={`${u.type}_${u.id}`}>
                                                                <td>
                                                                    <div style={{ fontWeight: 800 }}>{u.username}</div>
                                                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>{u.type}</div>
                                                                </td>
                                                                <td style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>Locked until: {new Date(u.locked_until).toLocaleString()}</td>
                                                                <td style={{ textAlign: 'right' }}>
                                                                    <button className="btn btn-sm btn-primary" onClick={() => unlockUser(u.id, u.type)} disabled={busyId === u.id}>Restore Access</button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="card shadow-md" style={{ background: 'var(--bg-secondary)' }}>
                                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Global Security Policy</h3>
                                            <div style={{ padding: '1rem', background: 'var(--bg-body)', borderRadius: 8, fontSize: '0.85rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span>Brute-force logic:</span> <span>STRICT</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}><span>JWT Rotation:</span> <span>REVOLVING</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sanitize Payloads:</span> <span>ACTIVE</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- SECURITY LIMITS TAB --- */}
                            {tab === 'security-limits' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Zap size={24} className="text-accent" /> Security & Rate Limiting</h2>
                                    <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', maxWidth: 800 }}>Manage system thresholds to prevent brute-force attacks and ensure dashboard data availability. High limits prevent 429 lockouts, while low limits enhance security.</p>
                                    
                                    <div className="card shadow-lg" style={{ maxWidth: 600 }}>
                                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                                            <label style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.75rem' }}>GLOBAL API RATE LIMIT (REQ / 15 MINS)</label>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    style={{ flex: 1, fontSize: '1.25rem', fontWeight: 900 }} 
                                                    value={rateLimits.global} 
                                                    onChange={e => setRateLimits({...rateLimits, global: parseInt(e.target.value)})} 
                                                />
                                                <div style={{ padding: '0.5rem 1rem', background: 'var(--bg-body)', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700 }}>~{Math.round(rateLimits.global / 15)} REQ/MIN</div>
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '1rem', lineHeight: 1.5 }}>
                                                Recommended: <strong>500+</strong> for portals with many parallel data requests. Lowering this may cause dashboard "zeroing" if components fail to load.
                                            </p>
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '2.5rem' }}>
                                            <label style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.75rem' }}>AUTHENTICATION ATTEMPT LIMIT (REQ / 15 MINS)</label>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <input 
                                                    type="number" 
                                                    className="input" 
                                                    style={{ flex: 1, fontSize: '1.25rem', fontWeight: 900 }} 
                                                    value={rateLimits.auth} 
                                                    onChange={e => setRateLimits({...rateLimits, auth: parseInt(e.target.value)})} 
                                                />
                                                <div className="badge badge-danger">BRUTE-FORCE SHIELD</div>
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '1rem', lineHeight: 1.5 }}>
                                                Recommended: <strong>20-50</strong>. This limits how many times a user can attempt to login or verify their identity.
                                            </p>
                                        </div>

                                        <div style={{ padding: '1.25rem', background: 'var(--bg-body)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: '2rem' }}>
                                            <h4 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Info size={14} className="text-accent" /> Security Brief</h4>
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                                Rate limits are tracked by IP address. Legitimate users behind corporate proxies may share a limit. If users report "Too Many Requests" errors, increase these thresholds.
                                            </p>
                                        </div>

                                        <button 
                                            className="btn btn-primary" 
                                            style={{ width: '100%', padding: '1rem', fontWeight: 800, fontSize: '1rem' }} 
                                            onClick={saveRateLimits} 
                                            disabled={busyId === 'saving_limits'}
                                        >
                                            {busyId === 'saving_limits' ? <RefreshCw className="spin" size={20} /> : <Save size={20} />} Sync System Thresholds
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* --- CONFIG HISTORY TAB --- */}
                            {tab === 'config-history' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Clock size={24} className="text-accent" /> Environmental Configuration Registry</h2>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead><tr><th>Revision Tag</th><th>Delta Change</th><th>Principal</th><th>Timestamp</th></tr></thead>
                                            <tbody>
                                                {cfgHist.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>No configuration changes recorded yet.</td></tr>}
                                                {cfgHist.map((h, i) => (
                                                    <tr key={i}>
                                                        <td style={{ fontWeight: 800 }}>REV_{h.id}</td>
                                                        <td><code style={{ fontSize: '0.75rem' }}>{h.changes}</code></td>
                                                        <td>{h.admin}</td>
                                                        <td style={{ fontSize: '0.8rem', opacity: 0.6 }}>{new Date(h.ts).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* --- CONTENT & LABELS TAB --- */}
                            {tab === 'content-labels' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Edit3 size={24} className="text-accent" /> Lexical Overrides & Branding</h2>
                                        <button className="btn btn-primary" onClick={saveLabels} disabled={busyId === 'saving_labels'}><Save size={18} /> Sync Lexicon</button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                        {Object.entries(labels).map(([k, v]) => (
                                            <div key={k} className="form-group">
                                                <label style={{ fontSize: '0.7rem', fontWeight: 800 }}>{k.toUpperCase()}</label>
                                                <input className="input" value={v} onChange={e => setLabels({...labels, [k]: e.target.value})} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- BRAND IDENTITY TAB --- */}
                            {tab === 'brand-identity' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Layout size={24} className="text-accent" /> Corporate Identity Projection</h2>
                                    <div className="card shadow-lg" style={{ maxWidth: 600 }}>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label>Portal Primary Name (OSD)</label>
                                            <input className="input" value={brandCfg.portalTitle} onChange={e => setBrandCfg({...brandCfg, portalTitle: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                                            <div className="form-group"><label>Primary HEX Tone</label><input type="color" className="input" style={{ height: 45, padding: 4 }} value={brandCfg.primaryColor} onChange={e => setBrandCfg({...brandCfg, primaryColor: e.target.value})} /></div>
                                            <div className="form-group"><label>Secondary Background</label><input type="color" className="input" style={{ height: 45, padding: 4 }} value={brandCfg.secondaryColor} onChange={e => setBrandCfg({...brandCfg, secondaryColor: e.target.value})} /></div>
                                        </div>
                                        
                                        <div style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Login Page Aesthetics</h3>
                                            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                                                <div className="form-group">
                                                    <label>Login Portal Title</label>
                                                    <input className="input" value={brandCfg.loginTitle} onChange={e => setBrandCfg({...brandCfg, loginTitle: e.target.value})} placeholder="e.g. LIFE-LONG UNITY" />
                                                </div>
                                                <div className="form-group">
                                                    <label>Login Portal Subtitle</label>
                                                    <input className="input" value={brandCfg.loginSubtitle} onChange={e => setBrandCfg({...brandCfg, loginSubtitle: e.target.value})} placeholder="e.g. Member Portal" />
                                                </div>
                                            </div>
                                            <div className="form-group" style={{ marginTop: '1.5rem' }}>
                                                <label>Login Tagline / Vision</label>
                                                <input className="input" value={brandCfg.loginTagline} onChange={e => setBrandCfg({...brandCfg, loginTagline: e.target.value})} placeholder="e.g. Financial stability for every member" />
                                            </div>
                                        </div>
                                        
                                        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={saveBrand} disabled={busyId === 'saving_brand'}>Commit Identity Projection</button>
                                    </div>
                                </div>
                            )}

                             {/* --- EXPERIENCE ARCHITECT TAB --- */}
                             {tab === 'experience-architect' && (
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <Layout size={24} className="text-accent" /> Strategic Experience Architect
                                            </h2>
                                            <p style={{ color: 'var(--text-secondary)', maxWidth: 800 }}>Deconstruct and redesign the platform's user interface. Edit labels, swap icons, and define visibility logic for every module.</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <div className="badge badge-success" style={{ padding: '0.5rem 1rem' }}>Real-time Sync Active</div>
                                        </div>
                                     </div>

                                     <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', alignItems: 'flex-start' }}>
                                         {/* Module List Sidebar */}
                                         <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                                             <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                                                 <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800 }}>SELECT COMPONENT</h4>
                                             </div>
                                             <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                                                 {[
                                                     { section: 'Admin Workspace - Financials', items: [
                                                         { id: 'admin_dashboard', label: 'Dashboard', key: 'overview', icon: LayoutDashboard },
                                                         { id: 'admin_payments', label: 'Payments', key: 'toggle_admin_payments', icon: CreditCard },
                                                         { id: 'admin_reconciliation', label: 'Reconciliation', key: 'toggle_admin_reconciliation', icon: RefreshCw },
                                                         { id: 'admin_savings', label: 'Savings', key: 'toggle_admin_savings', icon: PiggyBank },
                                                         { id: 'admin_withdrawals', label: 'Payouts/Withdrawals', key: 'toggle_admin_withdrawals', icon: Banknote },
                                                         { id: 'admin_loans', label: 'Loan Book', key: 'toggle_admin_loans', icon: Banknote },
                                                         { id: 'admin_loan_apps', label: 'Loan Applications', key: 'toggle_admin_loans', icon: FileCheck },
                                                         { id: 'admin_expenses', label: 'Expense Tracking', key: 'toggle_admin_expenses', icon: Receipt },
                                                         { id: 'admin_dividends', label: 'Dividend Engine', key: 'toggle_admin_dividends', icon: Award },
                                                         { id: 'admin_pledges', label: 'Pledges', key: 'toggle_admin_pledges', icon: Handshake },
                                                         { id: 'admin_investments', label: 'Investments', key: 'toggle_admin_investments', icon: TrendingUp }
                                                     ]},
                                                     { section: 'Admin Workspace - Governance', items: [
                                                         { id: 'admin_members', label: 'Member Registry', key: 'toggle_admin_members', icon: Users },
                                                         { id: 'admin_meetings', label: 'Meeting Manager', key: 'toggle_admin_meetings', icon: Calendar },
                                                         { id: 'admin_communications', label: 'Communications', key: 'toggle_admin_communications', icon: MessageSquare },
                                                         { id: 'admin_campaigns', label: 'Announcements', key: 'toggle_admin_campaigns', icon: Megaphone },
                                                         { id: 'admin_polls', label: 'Polls & Voting', key: 'toggle_admin_polls', icon: PieChart },
                                                         { id: 'admin_reports', label: 'Business Intelligence', key: 'toggle_admin_reports', icon: FileText },
                                                         { id: 'admin_risk', label: 'Risk Intelligence', key: 'toggle_admin_risk', icon: ShieldAlert },
                                                         { id: 'admin_logs', label: 'Audit Trail', key: 'toggle_admin_logs', icon: History },
                                                         { id: 'admin_settings', label: 'System Settings', key: 'toggle_admin_settings', icon: SettingsIcon },
                                                         { id: 'admin_security', label: 'Security Center', key: 'toggle_admin_security', icon: ShieldCheck }
                                                     ]},
                                                     { section: 'Member Portal - Core', items: [
                                                         { id: 'member_dashboard', label: 'Dashboard Overview', key: 'overview', icon: LayoutDashboard },
                                                         { id: 'member_payments', label: 'My Payments', key: 'toggle_member_payments', icon: CreditCard },
                                                         { id: 'member_savings', label: 'Savings & Pots', key: 'toggle_member_savings', icon: PiggyBank },
                                                         { id: 'member_loans', label: 'Loan Portfolio', key: 'toggle_member_loans', icon: Banknote },
                                                         { id: 'member_apply_loan', label: 'Apply for Loan', key: 'toggle_member_loans', icon: FileCheck },
                                                         { id: 'member_dividends', label: 'Dividends', key: 'toggle_member_dividends', icon: Award },
                                                         { id: 'member_pledges', label: 'Pledge History', key: 'toggle_member_pledges', icon: Handshake },
                                                         { id: 'member_penalties', label: 'Penalties', key: 'toggle_member_penalties', icon: AlertTriangle }
                                                     ]},
                                                     { section: 'Member Portal - Community', items: [
                                                         { id: 'member_meetings', label: 'Meetings/AGM', key: 'toggle_member_meetings', icon: Calendar },
                                                         { id: 'member_polls', label: 'Community Polls', key: 'toggle_member_polls', icon: PieChart },
                                                         { id: 'member_docs', label: 'Document Vault', key: 'toggle_member_documents', icon: ShieldCheck },
                                                         { id: 'member_guarantors', label: 'Guarantors', key: 'toggle_member_guarantors', icon: Shield },
                                                         { id: 'member_resolutions', label: 'Board Resolutions', key: 'toggle_member_resolutions', icon: FileText },
                                                         { id: 'member_kyc', label: 'ID & Verification', key: 'toggle_member_kyc', icon: Smartphone },
                                                         { id: 'member_support', label: 'Support Hub', key: 'toggle_member_support', icon: MessageSquare }
                                                     ]}
                                                 ].map(sec => (
                                                     <div key={sec.section}>
                                                         <div style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.02)', fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{sec.section}</div>
                                                         {sec.items.map(m => (
                                                             <button 
                                                                 key={m.id}
                                                                 onClick={() => setSelectedModule(m)}
                                                                 style={{ 
                                                                     width: '100%', 
                                                                     textAlign: 'left', 
                                                                     padding: '0.85rem 1.25rem', 
                                                                     background: selectedModule?.id === m.id ? 'var(--accent-dim)' : 'transparent',
                                                                     border: 'none',
                                                                     borderLeft: selectedModule?.id === m.id ? '4px solid var(--accent)' : '4px solid transparent',
                                                                     color: selectedModule?.id === m.id ? 'var(--accent)' : 'var(--text-primary)',
                                                                     fontSize: '0.85rem',
                                                                     fontWeight: selectedModule?.id === m.id ? 700 : 500,
                                                                     cursor: 'pointer',
                                                                     transition: 'all 0.2s',
                                                                     display: 'flex',
                                                                     justifyContent: 'space-between',
                                                                     alignItems: 'center'
                                                                 }}
                                                             >
                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                    <m.icon size={16} style={{ opacity: 0.6 }} />
                                                                    {portalCfg[`ui_label_${m.id}`] || m.label}
                                                                 </div>
                                                                 {portalCfg[m.key] === 'false' && <Power size={12} style={{ color: 'var(--danger)', opacity: 0.8 }} />}
                                                             </button>
                                                         ))}
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>

                                         {/* Editor Panel */}
                                         <div className="card shadow-lg" style={{ minHeight: '500px', background: 'var(--surface)', position: 'relative' }}>
                                             {selectedModule ? (
                                                 <div style={{ padding: '2rem' }}>
                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                                                <Layout size={24} />
                                                            </div>
                                                            <div>
                                                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{selectedModule.label} Architect</h3>
                                                                <code style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>ID: {selectedModule.id} | System Key: {selectedModule.key}</code>
                                                            </div>
                                                         </div>
                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: portalCfg[selectedModule.key] === 'false' ? 'var(--danger)' : 'var(--success)' }}>
                                                                {portalCfg[selectedModule.key] === 'false' ? '🔴 MODULE DISABLED' : '🟢 MODULE LIVE'}
                                                            </span>
                                                         </div>
                                                     </div>

                                                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                             <div className="form-group">
                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                     <Edit3 size={14} className="text-accent" /> COMPONENT NAME
                                                                 </label>
                                                                 <input 
                                                                    className="input" 
                                                                    value={portalCfg[`ui_label_${selectedModule.id}`] || selectedModule.label}
                                                                    onChange={e => saveConfig({ [`ui_label_${selectedModule.id}`]: e.target.value })}
                                                                    placeholder="e.g. My Credit"
                                                                 />
                                                             </div>

                                                             <div className="form-group">
                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                     <Info size={14} className="text-accent" /> DESCRIPTION / HINT
                                                                 </label>
                                                                 <textarea 
                                                                    className="input" 
                                                                    style={{ height: '80px', paddingTop: '0.75rem' }}
                                                                    value={portalCfg[`ui_desc_${selectedModule.id}`] || ''}
                                                                    onChange={e => saveConfig({ [`ui_desc_${selectedModule.id}`]: e.target.value })}
                                                                    placeholder="Tell users what this module does..."
                                                                 />
                                                             </div>

                                                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                                <div className="form-group">
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                        <Activity size={14} className="text-accent" /> ACCENT TONE
                                                                    </label>
                                                                    <input 
                                                                        type="color"
                                                                        className="input" 
                                                                        style={{ height: 45, padding: 4 }}
                                                                        value={portalCfg[`ui_color_${selectedModule.id}`] || '#22c55e'}
                                                                        onChange={e => saveConfig({ [`ui_color_${selectedModule.id}`]: e.target.value })}
                                                                    />
                                                                </div>
                                                                <div className="form-group">
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                        <ShieldCheck size={14} className="text-accent" /> ICON GLYPH
                                                                    </label>
                                                                    <select 
                                                                        className="input"
                                                                        value={portalCfg[`ui_icon_${selectedModule.id}`] || ''}
                                                                        onChange={e => saveConfig({ [`ui_icon_${selectedModule.id}`]: e.target.value })}
                                                                    >
                                                                        <option value="">Default Glyph</option>
                                                                        <option value="CreditCard">CreditCard</option>
                                                                        <option value="Banknote">Banknote</option>
                                                                        <option value="PiggyBank">PiggyBank</option>
                                                                        <option value="TrendingUp">TrendingUp</option>
                                                                        <option value="Users">Users</option>
                                                                        <option value="Calendar">Calendar</option>
                                                                        <option value="Shield">Shield</option>
                                                                        <option value="Zap">Zap</option>
                                                                        <option value="Heart">Heart</option>
                                                                        <option value="Star">Star</option>
                                                                    </select>
                                                                </div>
                                                             </div>

                                                             <div className="form-group">
                                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 800 }}>
                                                                     <Activity size={14} className="text-accent" /> STRATEGIC DEPLOYMENT
                                                                 </label>
                                                                 <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                                    <button 
                                                                        className={`btn ${portalCfg[selectedModule.key] === 'false' ? 'btn-ghost' : 'btn-primary'}`}
                                                                        style={{ flex: 1, gap: '0.5rem', fontSize: '0.75rem' }}
                                                                        onClick={() => toggleConfig(selectedModule.key, portalCfg[selectedModule.key])}
                                                                    >
                                                                        {portalCfg[selectedModule.key] === 'false' ? <Power size={14} /> : <CheckCircle2 size={14} />}
                                                                        {portalCfg[selectedModule.key] === 'false' ? 'ENABLE MODULE' : 'MODULE IS LIVE'}
                                                                    </button>
                                                                    <button className="btn btn-ghost" style={{ border: '1px solid var(--border)', fontSize: '0.75rem' }}>RESTRICT ROLE</button>
                                                                 </div>
                                                             </div>
                                                         </div>

                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                            <div style={{ background: 'var(--surface-2)', padding: '2rem', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flex: 1 }}>
                                                                <div style={{ 
                                                                    width: 100, 
                                                                    height: 100, 
                                                                    borderRadius: 24, 
                                                                    background: portalCfg[`ui_color_${selectedModule.id}`] || 'var(--accent)', 
                                                                    display: 'flex', 
                                                                    alignItems: 'center', 
                                                                    justifyContent: 'center', 
                                                                    color: '#fff', 
                                                                    marginBottom: '1.5rem', 
                                                                    boxShadow: `0 12px 32px ${portalCfg[`ui_color_${selectedModule.id}`] || 'var(--accent)'}44`,
                                                                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                                                }}>
                                                                    <Layout size={48} />
                                                                </div>
                                                                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                                                                    {portalCfg[`ui_label_${selectedModule.id}`] || selectedModule.label}
                                                                </h4>
                                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.75rem', maxWidth: '280px', lineHeight: 1.6 }}>
                                                                    {portalCfg[`ui_desc_${selectedModule.id}`] || 'Experience how this component looks and behaves with your custom architecture.'}
                                                                </p>
                                                                
                                                                <div style={{ marginTop: '2.5rem', display: 'flex', gap: '0.5rem', width: '100%' }}>
                                                                    <div style={{ height: 4, flex: 1, background: portalCfg[`ui_color_${selectedModule.id}`] || 'var(--accent)', borderRadius: 2, opacity: 0.3 }}></div>
                                                                    <div style={{ height: 4, flex: 2, background: portalCfg[`ui_color_${selectedModule.id}`] || 'var(--accent)', borderRadius: 2 }}></div>
                                                                    <div style={{ height: 4, flex: 1, background: portalCfg[`ui_color_${selectedModule.id}`] || 'var(--accent)', borderRadius: 2, opacity: 0.3 }}></div>
                                                                </div>
                                                            </div>

                                                            <div className="card shadow-sm" style={{ padding: '1.25rem', background: 'rgba(var(--accent-rgb), 0.03)', border: '1px dotted var(--accent)' }}>
                                                                <h5 style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.5rem', opacity: 0.6 }}>Architect Pro-Tip</h5>
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>Use high-contrast glyphs and clear labels to improve member accessibility by up to 40%.</p>
                                                            </div>
                                                         </div>
                                                     </div>
                                                 </div>
                                             ) : (
                                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
                                                     <Edit3 size={64} style={{ marginBottom: '1rem' }} />
                                                     <p style={{ fontWeight: 700 }}>Select a module from the sidebar to begin designing.</p>
                                                 </div>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {/* --- SETTLEMENT AUTHORIZATION TAB --- */}
                             {tab === 'settlement-auth' && (
                                 <div>
                                     <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><ShieldCheck size={24} className="text-accent" /> Settlement Authorization Queue</h2>
                                     <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', maxWidth: 800 }}>Review and authorize final account closures. Members in this queue have been cleared by Finance and are awaiting final structural deactivation.</p>
 
                                     {selectedModule ? (
                                         <div className="animate-in">
                                             <button className="btn btn-ghost btn-sm" onClick={() => setSelectedModule(null)} style={{ marginBottom: '1.5rem' }}><RefreshCw size={14} style={{ marginRight: '0.5rem' }} /> Return to Queue</button>
                                             <SettlementAudit memberId={selectedModule} onClearanceUpdate={() => fetchPendingClosures()} />
                                         </div>
                                     ) : (
                                         <div className="grid grid-3" style={{ gap: '1.5rem' }}>
                                             {pendingClosures.length === 0 && (
                                                 <div className="card shadow-sm" style={{ gridColumn: '1 / -1', padding: '4rem', textAlign: 'center', opacity: 0.6 }}>
                                                     <div style={{ marginBottom: '1rem' }}><UserCheck size={48} className="text-dim" style={{ margin: '0 auto' }} /></div>
                                                     <p style={{ fontWeight: 700 }}>No pending closures in the authorization queue.</p>
                                                     <p style={{ fontSize: '0.85rem' }}>All account exits have been processed or are still in the Finance clearing stage.</p>
                                                 </div>
                                             )}
                                             {pendingClosures.map(m => (
                                                 <div key={m.id} className="card shadow-sm hover-scale" style={{ padding: '1.5rem', border: '1px solid var(--border)' }}>
                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                         <div className="badge badge-warning" style={{ background: 'var(--warning-dim)', color: 'var(--warning)', border: 'none' }}>Awaiting ICT Auth</div>
                                                         <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)' }}>#{m.membershipNumber}</span>
                                                     </div>
                                                     <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 800 }}>{m.name}</h4>
                                                     <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                                         Total Savings to Disburse: <br/>
                                                         <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1rem' }}>KES {m.totalSavings?.toLocaleString()}</span>
                                                     </p>
                                                     <button className="btn btn-primary btn-sm" style={{ width: '100%', fontWeight: 700 }} onClick={() => setSelectedModule(m.id)}>Review & Finalize</button>
                                                 </div>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                             )}

                             {/* --- NAVIGATION MANAGER TAB --- */}
                             {tab === 'navigation-manager' && (
                                 <div>
                                     <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Map size={24} className="text-accent" /> Strategic Navigation Controller</h2>
                                     <p style={{ color: 'var(--text-secondary)', marginBottom: '3rem', maxWidth: 800 }}>Enable or disable core modules across the entire platform. Changes are applied in real-time to both Admin and Member portals.</p>
                                     
                                     {[
                                         { section: 'Admin Portal - Financials', items: [
                                             { key: 'toggle_admin_payments', label: 'Payments Module', icon: CreditCard },
                                             { key: 'toggle_admin_reconciliation', label: 'Reconciliation Engine', icon: RefreshCw },
                                             { key: 'toggle_admin_savings', label: 'Savings Ledger', icon: PiggyBank },
                                             { key: 'toggle_admin_loans', label: 'Loan Management', icon: Banknote },
                                             { key: 'toggle_admin_withdrawals', label: 'Withdrawal Processing', icon: DollarSign },
                                             { key: 'toggle_admin_pledges', label: 'Commitment Pledges', icon: Handshake },
                                             { key: 'toggle_admin_investments', label: 'Portfolio Analytics', icon: TrendingUp },
                                             { key: 'toggle_admin_expenses', label: 'Expense Tracking', icon: Receipt },
                                         ]},
                                         { section: 'Admin Portal - Governance & Ops', items: [
                                             { key: 'toggle_admin_members', label: 'Member Registry', icon: Users },
                                             { key: 'toggle_admin_meetings', label: 'Meeting Scheduler', icon: Calendar },
                                             { key: 'toggle_admin_communications', label: 'Communication Hub', icon: MessageSquare },
                                             { key: 'toggle_admin_polls', label: 'Decision Polls', icon: PieChart },
                                             { key: 'toggle_admin_reports', label: 'Business Intelligence', icon: FileText },
                                             { key: 'toggle_admin_risk', label: 'Risk Management', icon: ShieldAlert },
                                             { key: 'toggle_admin_users', label: 'System Access Control', icon: Key },
                                             { key: 'toggle_admin_logs', label: 'Audit Trail / Logs', icon: History },
                                             { key: 'toggle_admin_settings', label: 'Global Configurations', icon: SettingsIcon },
                                         ]},
                                         { section: 'Member Portal - Core Features', items: [
                                             { key: 'toggle_member_loans', label: 'Loan Self-Service', icon: Banknote },
                                             { key: 'toggle_member_payments', label: 'Online Payments', icon: CreditCard },
                                             { key: 'toggle_member_savings', label: 'Savings & Pots', icon: PiggyBank },
                                             { key: 'toggle_member_dividends', label: 'Dividend Tracker', icon: TrendingUp },
                                             { key: 'toggle_member_pledges', label: 'Pledge Management', icon: Handshake },
                                             { key: 'toggle_member_guarantors', label: 'Guarantor Requests', icon: Shield },
                                             { key: 'toggle_member_meetings', label: 'AGM & Meetings', icon: Calendar },
                                             { key: 'toggle_member_polls', label: 'Community Voting', icon: PieChart },
                                             { key: 'toggle_member_resolutions', label: 'Board Resolutions', icon: FileText },
                                             { key: 'toggle_member_penalties', label: 'Penalty Management', icon: AlertTriangle },
                                             { key: 'toggle_member_campaigns', label: 'Official Announcements', icon: Megaphone },
                                             { key: 'toggle_member_support', label: 'Member Support Hub', icon: MessageSquare },
                                             { key: 'toggle_member_documents', label: 'Secure Document Vault', icon: ShieldCheck },
                                             { key: 'toggle_member_kyc', label: 'ID & KYC Verification', icon: Smartphone },
                                             { key: 'toggle_mpesa_integration', label: 'M-Pesa Gateway', icon: Smartphone },
                                         ]}
                                     ].map(grp => (
                                         <div key={grp.section} style={{ marginBottom: '4rem' }}>
                                             <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-dim)', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{grp.section}</h3>
                                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                                                 {grp.items.map(it => (
                                                     <div key={it.key} className="card shadow-sm" style={{ 
                                                         display: 'flex', 
                                                         justifyContent: 'space-between', 
                                                         alignItems: 'center', 
                                                         padding: '1rem 1.25rem',
                                                         background: portalCfg[it.key] === 'false' ? 'rgba(239, 68, 68, 0.03)' : 'var(--card-bg)',
                                                         border: portalCfg[it.key] === 'false' ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid var(--border)'
                                                     }}>
                                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                             <div style={{ color: portalCfg[it.key] === 'false' ? 'var(--text-dim)' : 'var(--accent)' }}>
                                                                 <it.icon size={20} />
                                                             </div>
                                                             <span style={{ fontWeight: 700, fontSize: '0.9rem', color: portalCfg[it.key] === 'false' ? 'var(--text-dim)' : 'var(--text-primary)' }}>{it.label}</span>
                                                         </div>
                                                         <button 
                                                             className={`btn btn-sm ${portalCfg[it.key] === 'false' ? 'btn-ghost' : 'btn-success'}`} 
                                                             onClick={() => toggleConfig(it.key, portalCfg[it.key])}
                                                             disabled={busyId === it.key}
                                                             style={{ height: 32, width: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                         >
                                                             {busyId === it.key ? <RefreshCw className="spin" size={14} /> : (portalCfg[it.key] === 'false' ? <Power size={14} /> : <CheckCircle2 size={14} />)}
                                                         </button>
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             )}

                             {/* --- WELFARE INTELLIGENCE TAB --- */}
                             {tab === 'welfare-intelligence' && (
                                 <div>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                         <div>
                                             <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><LifeBuoy size={24} className="text-accent" /> Welfare & Benevolence Intelligence</h2>
                                             <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Tracking community fund health and member contribution compliance.</p>
                                         </div>
                                         <button className="btn btn-ghost" onClick={fetchWelfareData}><RefreshCw size={18} /></button>
                                     </div>

                                     {welfareStats && (
                                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                             <div className="card shadow-md" style={{ background: 'var(--bg-card)', borderLeft: '4px solid var(--accent)' }}>
                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.5, textTransform: 'uppercase' }}>Total Welfare Pool</span>
                                                 <h3 style={{ fontSize: '1.75rem', fontWeight: 900, margin: '0.5rem 0' }}>KES {(welfareStats.totalBalance || 0).toLocaleString()}</h3>
                                                 <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Active Reserves</div>
                                             </div>
                                             <div className="card shadow-md" style={{ background: 'var(--bg-card)' }}>
                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.5, textTransform: 'uppercase' }}>Monthly Compliance</span>
                                                 <h3 style={{ fontSize: '1.75rem', fontWeight: 900, margin: '0.5rem 0' }}>{welfareStats.compliancePct}%</h3>
                                                 <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{welfareStats.contributorsThisMonth} / {welfareStats.totalActiveMembers} Members Paid</div>
                                             </div>
                                             <div className="card shadow-md" style={{ background: 'var(--bg-card)' }}>
                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.5, textTransform: 'uppercase' }}>Fund Velocity</span>
                                                 <h3 style={{ fontSize: '1.75rem', fontWeight: 900, margin: '0.5rem 0' }}>KES {(welfareStats.monthlyTrends[welfareStats.monthlyTrends.length-1]?.total || 0).toLocaleString()}</h3>
                                                 <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Collections this month</div>
                                             </div>
                                             <div className="card shadow-md" style={{ background: 'var(--bg-card)', borderLeft: '4px solid var(--warning)' }}>
                                                 <span style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.5, textTransform: 'uppercase' }}>Reg Fees Collected</span>
                                                 <h3 style={{ fontSize: '1.75rem', fontWeight: 900, margin: '0.5rem 0' }}>KES {welfareStats.regFeesCollected?.toLocaleString() || 0}</h3>
                                                 <div style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>{welfareStats.regFeeCompliance || 0}% Compliance</div>
                                             </div>
                                         </div>
                                     )}

                                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                                         <div className="card shadow-sm" style={{ padding: 0 }}>
                                             <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                 <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Recent Welfare Activity</h3>
                                                 <span className="badge badge-accent">LAST 100 TXNS</span>
                                             </div>
                                             <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                                 <table className="table">
                                                     <thead><tr><th>Member</th><th>Amount</th><th>Date</th><th>Reference</th></tr></thead>
                                                     <tbody>
                                                         {welfareHistory.length === 0 ? <tr className="empty-row"><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No welfare records found.</td></tr> : (
                                                             welfareHistory.map(h => (
                                                                 <tr key={h.id}>
                                                                     <td>
                                                                         <div style={{ fontWeight: 800 }}>{h.memberName}</div>
                                                                         <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{h.membershipNumber}</div>
                                                                     </td>
                                                                     <td style={{ fontWeight: 800, color: 'var(--success)' }}>KES {(h.amount || 0).toLocaleString()}</td>
                                                                     <td style={{ fontSize: '0.8rem' }}>{new Date(h.date).toLocaleDateString()}</td>
                                                                     <td><code style={{ fontSize: '0.75rem' }}>{h.reference}</code></td>
                                                                 </tr>
                                                             ))
                                                         )}
                                                     </tbody>
                                                 </table>
                                             </div>
                                         </div>

                                         <div>
                                             <div className="card shadow-sm" style={{ background: 'var(--bg-secondary)', marginBottom: '1.5rem' }}>
                                                 <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1rem' }}>Fund Analytics</h4>
                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                     {welfareStats?.monthlyTrends.map((t, i) => (
                                                         <div key={i}>
                                                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                                                                 <span>{t.month}</span>
                                                                 <span style={{ fontWeight: 800 }}>KES {(t.total || 0).toLocaleString()}</span>
                                                             </div>
                                                             <div style={{ height: 6, background: 'var(--bg-body)', borderRadius: 3, overflow: 'hidden' }}>
                                                                 <div style={{ 
                                                                     height: '100%', 
                                                                     width: `${(t.total / (welfareStats.totalBalance || 1)) * 100}%`, 
                                                                     background: 'var(--accent)',
                                                                     minWidth: '2px'
                                                                 }}></div>
                                                             </div>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>

                                             <div className="card shadow-sm" style={{ border: '1px dashed var(--accent)' }}>
                                                 <h4 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--accent)' }}>Governance Notice</h4>
                                                 <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                                     Welfare funds are restricted and should only be disbursed for verified benevolent claims as per the SACCO constitution.
                                                 </p>
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {/* --- DIVIDEND ENGINE TAB --- */}
                             {tab === 'dividend-engine' && (
                                 <div>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                         <div>
                                             <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Zap size={24} className="text-accent" /> Institutional Dividend Engine</h2>
                                             <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Automated allocation of profits back to members based on savings performance.</p>
                                         </div>
                                         <div className="badge badge-success" style={{ padding: '0.5rem 1rem' }}>v3.0 Multi-Source Distribution</div>
                                     </div>

                                     <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '2rem' }}>
                                         <form onSubmit={runDividendEngine} className="card shadow-lg" style={{ height: 'fit-content' }}>
                                             <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.5rem' }}>Distribution Logic</h3>
                                             
                                             <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                 <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>FUNDING SOURCE (LIQUIDITY POOL)</label>
                                                 <select 
                                                     className="input" 
                                                     style={{ width: '100%' }}
                                                     value={divForm.fundingSource} 
                                                     onChange={e => setDivForm({...divForm, fundingSource: e.target.value})}
                                                 >
                                                     <option value="Penalties/Fines">Penalties & Fines Pool</option>
                                                     <option value="Interest from Loans">Loan Interest Profits</option>
                                                     <option value="Investment Profits">Investment Capital Returns</option>
                                                     <option value="Welfare Fund">Benevolent/Welfare Pool</option>
                                                 </select>
                                                 <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>Ensure the selected pool has sufficient liquidity before execution.</p>
                                             </div>

                                             <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                 <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>TOTAL DISTRIBUTION AMOUNT (KES)</label>
                                                 <input 
                                                     type="number" 
                                                     className="input" 
                                                     style={{ width: '100%', fontSize: '1.25rem', fontWeight: 800 }}
                                                     value={divForm.poolAmount} 
                                                     onChange={e => setDivForm({...divForm, poolAmount: e.target.value})}
                                                     placeholder="e.g. 500000"
                                                     required
                                                 />
                                             </div>

                                             <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                                 <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>ALLOCATION METHOD</label>
                                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                                     <button 
                                                         type="button"
                                                         className={`btn btn-sm ${divForm.method === 'proportional' ? 'btn-primary' : 'btn-ghost'}`}
                                                         onClick={() => setDivForm({...divForm, method: 'proportional'})}
                                                     >
                                                         Proportional
                                                     </button>
                                                     <button 
                                                         type="button"
                                                         className={`btn btn-sm ${divForm.method === 'equal' ? 'btn-primary' : 'btn-ghost'}`}
                                                         onClick={() => setDivForm({...divForm, method: 'equal'})}
                                                     >
                                                         Equal Split
                                                     </button>
                                                 </div>
                                             </div>

                                             <div className="form-group" style={{ marginBottom: '2rem' }}>
                                                 <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 800 }}>TRANSACTIONAL NOTE</label>
                                                 <textarea 
                                                     className="input" 
                                                     style={{ width: '100%', minHeight: 80 }}
                                                     value={divForm.note} 
                                                     onChange={e => setDivForm({...divForm, note: e.target.value})}
                                                     placeholder="e.g. FY2025 Q1 Interest Distribution"
                                                 />
                                             </div>

                                             <button 
                                                 type="submit" 
                                                 className="btn btn-primary" 
                                                 style={{ width: '100%', padding: '1rem', fontWeight: 800 }}
                                                 disabled={busyId === 'dividend_run'}
                                             >
                                                 {busyId === 'dividend_run' ? <RefreshCw className="spin" size={20} /> : <Play size={20} />} TRIGGER ALLOCATION
                                             </button>
                                         </form>

                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                             {divResult ? (
                                                 <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card shadow-lg" style={{ background: 'var(--bg-card)', border: '2px solid var(--success)' }}>
                                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                                         <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--success)' }}>CYCLE COMPLETED</h3>
                                                         <div className="badge badge-success">SUCCESS</div>
                                                     </div>
                                                     <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                                         <div style={{ padding: '1rem', background: 'var(--bg-body)', borderRadius: 12 }}>
                                                             <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>TOTAL PAID</div>
                                                             <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>KES {divResult.totalDistributed.toLocaleString()}</div>
                                                         </div>
                                                         <div style={{ padding: '1rem', background: 'var(--bg-body)', borderRadius: 12 }}>
                                                             <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>RECIPIENTS</div>
                                                             <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{divResult.memberCount} Members</div>
                                                         </div>
                                                     </div>
                                                     <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                         Dividends have been credited to member wallets and recorded against the <strong>{divForm.fundingSource}</strong> fund. SMS notifications have been queued for dispatch.
                                                     </div>
                                                 </motion.div>
                                             ) : (
                                                 <div className="card shadow-sm" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                     <History size={48} style={{ marginBottom: '1rem' }} />
                                                     <p style={{ fontWeight: 700 }}>No active distribution result.</p>
                                                     <p style={{ fontSize: '0.85rem' }}>Configure parameters and trigger the engine to see real-time impact analysis.</p>
                                                 </div>
                                             )}

                                             <div className="card shadow-sm" style={{ padding: 0 }}>
                                                 <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 800 }}>Historical Distribution Registry</div>
                                                 <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                                     <table className="table">
                                                         <thead><tr><th>Date</th><th>Source Fund</th><th>Total Amount</th><th>Members</th></tr></thead>
                                                         <tbody>
                                                             {divHistory.length === 0 ? <tr className="empty-row"><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No previous cycles recorded.</td></tr> : (
                                                                 divHistory.map(h => (
                                                                     <tr key={h.id}>
                                                                         <td style={{ fontSize: '0.85rem' }}>{new Date(h.distributedAt).toLocaleDateString()}</td>
                                                                         <td><span className="badge badge-accent-outline" style={{ fontSize: '0.65rem' }}>{h.fundingSource || 'Reserves'}</span></td>
                                                                         <td style={{ fontWeight: 800 }}>KES {(h.totalAmount || 0).toLocaleString()}</td>
                                                                         <td>{h.memberCount}</td>
                                                                     </tr>
                                                                 ))
                                                             )}
                                                         </tbody>
                                                     </table>
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             )}

                            {/* --- SCHED MAINTENANCE TAB --- */}
                            {tab === 'sched-maintenance' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Calendar size={24} className="text-accent" /> Infrastructure Maintenance Windows</h2>
                                    <div className="card shadow-sm" style={{ padding: 0 }}>
                                        <table className="table">
                                            <thead><tr><th>System Component</th><th>Window Start</th><th>Duration</th><th>Severity</th></tr></thead>
                                            <tbody>
                                                {maintWindows.map(w => (
                                                    <tr key={w.id}>
                                                        <td style={{ fontWeight: 800 }}>{w.component}</td>
                                                        <td><span style={{ fontSize: '0.8rem' }}>{new Date(w.startAt).toLocaleString()}</span></td>
                                                        <td>{w.durationMins} Mins</td>
                                                        <td><span className={`badge badge-${w.severity === 'high' ? 'danger' : 'warning'}`}>{w.severity.toUpperCase()}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}



                            {/* --- DATA TOOLS TAB --- */}
                            {tab === 'data-tools' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Database size={24} className="text-accent" /> System Sanity Lab</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '2rem' }}>
                                        <div style={{ display: 'grid', gap: '1rem' }}>
                                            {[
                                                { id: 'vacuum', name: 'Database Vacuum', desc: 'Reclaim storage and optimize indexing performance.', icon: Server },
                                                { id: 'integrity_check', name: 'Identity Integrity Scan', desc: 'Find members with missing phone numbers or invalid membership IDs.', icon: ShieldCheck },
                                                { id: 'purge_sessions', name: 'Session Flush', desc: 'Forcefully clear all expired authentication sessions.', icon: Trash2 },
                                                { id: 'purge_sms_log', name: 'SMS Log Rotation', desc: 'Retain only the last 500 entries to maintain log density.', icon: Bug },
                                                { id: 'orphan_documents', name: 'Orphan File Cleanup', desc: 'Sync DB records with physical uploads/ folder.', icon: HardDrive },
                                            ].map(tool => (
                                                <div key={tool.id} className="card shadow-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                        <div style={{ color: 'var(--accent)', opacity: 0.8 }}><tool.icon size={22} /></div>
                                                        <div>
                                                            <h4 style={{ fontWeight: 800 }}>{tool.name}</h4>
                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{tool.desc}</p>
                                                        </div>
                                                    </div>
                                                    <button className="btn btn-primary btn-sm" onClick={() => runDataTool(tool.id)} disabled={busyId === tool.id}>
                                                        {busyId === tool.id ? <RefreshCw className="spin" size={14} /> : <Play size={14} />} Execute
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="card shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><History size={18} /> Engine Diagnostics</h3>
                                            {!toolResult ? (
                                                <div style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>Awaiting tool execution...</div>
                                            ) : (
                                                <div>
                                                    <div className="badge badge-accent" style={{ marginBottom: '1rem' }}>VERDICT</div>
                                                    <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>{toolResult.message}</p>
                                                    {toolResult.issues && (
                                                        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8 }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.5rem', color: '#f87171' }}>ISSUES DETECTED: {toolResult.totalIssues}</div>
                                                            <pre style={{ fontSize: '0.7rem', overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(toolResult.issues, null, 2)}</pre>
                                                        </div>
                                                            )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- BUDGET TRACKER TAB --- */}
                            {tab === 'budget-tracker' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><BarChart3 size={24} className="text-accent" /> Institutional Budget Oversight</h2>
                                    <BudgetTracker />
                                </div>
                            )}

                            {/* --- ALERT CONFIG TAB --- */}
                            {tab === 'alert-config' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Bell size={24} className="text-accent" /> Notification Thresholds</h2>
                                    <form onSubmit={saveAlertConfig} className="card shadow-lg" style={{ maxWidth: 600 }}>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label>Technical Support Phones (Comma separated)</label>
                                            <input className="input" value={alertCfg.alertPhones} onChange={e => setAlertCfg({...alertCfg, alertPhones: e.target.value})} placeholder="+254..." />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                                            <div className="form-group">
                                                <label>Memory Limit (%)</label>
                                                <input type="number" className="input" value={alertCfg.memThreshold} onChange={e => setAlertCfg({...alertCfg, memThreshold: e.target.value})} />
                                            </div>
                                            <div className="form-group">
                                                <label>Kernel Error Threshold (Count)</label>
                                                <input type="number" className="input" value={alertCfg.errorThreshold} onChange={e => setAlertCfg({...alertCfg, errorThreshold: e.target.value})} />
                                            </div>
                                        </div>
                                        <button className="btn btn-primary" type="submit" disabled={busyId === 'saving_alert'} style={{ width: '100%', padding: '1rem' }}>
                                            {busyId === 'saving_alert' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Lock Operational Parameters
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* --- LOGO & ASSETS TAB --- */}
                            {tab === 'logo-assets' && (
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Layout size={24} className="text-accent" /> Brand Identity Manager</h2>
                                    <div className="card shadow-lg" style={{ maxWidth: 500 }}>
                                        <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--bg-body)', borderRadius: 16, border: '2px dashed var(--border)', marginBottom: '1.5rem' }}>
                                            {logoStatus.exists ? <img src={`/src/assets/logo.png?v=${Date.now()}`} style={{ maxHeight: 80, marginBottom: '1rem' }} /> : <Image size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />}
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{logoStatus.exists ? `Current Logo: ${(logoStatus.size/1024).toFixed(1)} KB` : 'No custom logo uploaded.'}</p>
                                        </div>
                                        <label className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', cursor: 'pointer', padding: '1rem' }}>
                                            {uploadingLogo ? <RefreshCw className="spin" size={18} /> : <Plus size={18} />} Upload Strategic Identity
                                            <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                                        </label>
                                        <p style={{ fontSize: '0.7rem', textAlign: 'center', marginTop: '1rem', color: 'var(--text-dim)' }}>Supports PNG, SVG, and WebP. Max 2MB.</p>
                                    </div>
                                </div>
                            )}

                            {/* --- BACKUPS TAB ─── */}
                            {tab === 'system-recovery' && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>System Recovery & Data Wipe</h2>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Transition from testing to production by clearing all transactional data.</p>
                                        </div>
                                        <button className="btn btn-danger" onClick={() => setShowWipeModal(true)} style={{ padding: '0.75rem 1.5rem', fontWeight: 700 }}>
                                            <Trash2 size={18} style={{ marginRight: '0.6rem' }} /> WIPE ALL DATA
                                        </button>
                                    </div>

                                    <div className="grid grid-2" style={{ gap: '2rem' }}>
                                        <div className="card shadow-sm" style={{ padding: '2rem' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <History size={18} className="text-accent" /> Wipe History & Retention
                                            </h3>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                                                Every time a wipe is performed, a full safety backup is created. These backups are retained for <strong>30 days</strong> to allow verification or recovery before permanent deletion.
                                            </p>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {wipes.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-dim)' }}>No previous wipe records found.</div>}
                                                {wipes.map((w, i) => (
                                                    <div key={i} className="card" style={{ padding: '1rem', background: 'var(--bg-light)', border: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{w.filename}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                                                    Wiped on {new Date(w.createdAt).toLocaleString()} • {w.sizeKB} KB
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', marginTop: '0.4rem', color: w.isExpired ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                                                                    {w.isExpired ? 'EXPIRED' : `Auto-purge on ${new Date(w.expiresAt).toLocaleDateString()}`}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <a 
                                                                    href={`/api/ict/system-wipe/download/${w.filename}?token=${localStorage.getItem('mp_token')}`}
                                                                    className="btn btn-ghost btn-sm"
                                                                    title="Download Backup"
                                                                >
                                                                    <Download size={16} />
                                                                </a>
                                                                <button 
                                                                    className="btn btn-ghost btn-sm text-danger"
                                                                    onClick={() => purgeWipe(w.filename)}
                                                                    disabled={busyId === w.filename}
                                                                    title="Purge Permanently"
                                                                >
                                                                    {busyId === w.filename ? <RefreshCw className="spin" size={16} /> : <Trash2 size={16} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="card shadow-sm" style={{ padding: '2rem', border: '1px solid var(--danger-dim)', background: 'rgba(239, 68, 68, 0.02)' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <ShieldAlert size={18} /> Safety Information
                                            </h3>
                                            <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
                                                <li>Clears all <strong>Members</strong> and their registration status.</li>
                                                <li>Deletes all <strong>Payments, Loans, and Repayments</strong>.</li>
                                                <li>Wipes all <strong>Savings Pots, Penalties, and Ledger entries</strong>.</li>
                                                <li>Removes all <strong>Meetings, Polls, and Communication logs</strong>.</li>
                                                <li><strong className="text-primary">PRESERVES:</strong> Admin Users, System Settings, and Contribution Tiers.</li>
                                                <li>A safety backup is always created automatically.</li>
                                            </ul>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {showWipeModal && (
                                            <div className="modal-overlay" onClick={() => setShowWipeModal(false)}>
                                                <div className="modal-box shadow-lg" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
                                                    <div className="modal-header">
                                                        <h3 className="text-danger">🚨 Critical Action Required</h3>
                                                        <button className="btn btn-ghost" onClick={() => setShowWipeModal(false)}><X size={18}/></button>
                                                    </div>
                                                    <div style={{ padding: '1rem 0' }}>
                                                        <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                                                            You are about to perform a <strong>FULL SYSTEM WIPE</strong>. This will erase all member data and financial records.
                                                        </p>
                                                        <div style={{ padding: '1rem', background: 'var(--bg-light)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Safety Verification</label>
                                                            <p style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.75rem' }}>Type <strong>CONFIRM WIPE</strong> to authorize this operation.</p>
                                                            <input 
                                                                className="input" 
                                                                value={wipeConfirmText} 
                                                                onChange={e => setWipeConfirmText(e.target.value.toUpperCase())}
                                                                placeholder="Type confirmation here..."
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                                            <button 
                                                                className="btn btn-danger" 
                                                                style={{ flex: 2 }} 
                                                                disabled={wipeConfirmText !== 'CONFIRM WIPE' || busyId === 'executing_wipe'}
                                                                onClick={handleSystemWipe}
                                                            >
                                                                {busyId === 'executing_wipe' ? <RefreshCw className="spin" size={18} /> : <Trash2 size={18} />} EXECUTE SYSTEM WIPE
                                                            </button>
                                                            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowWipeModal(false)}>Cancel</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}

                            {/* --- VISUAL CUSTOMIZER TAB --- */}
                            {tab === 'visual-customizer' && (
                                <div className="visual-customizer-container">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                                            <div>
                                                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Layout size={24} className="text-accent" /> Visual UI Customizer</h2>
                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                                    <button 
                                                        className={`btn btn-sm ${activePortal === 'admin' ? 'btn-primary' : 'btn-ghost'}`} 
                                                        onClick={() => setActivePortal('admin')}
                                                        style={{ fontSize: '0.7rem' }}
                                                    >Admin Dashboard</button>
                                                    <button 
                                                        className={`btn btn-sm ${activePortal === 'member' ? 'btn-primary' : 'btn-ghost'}`} 
                                                        onClick={() => setActivePortal('member')}
                                                        style={{ fontSize: '0.7rem' }}
                                                    >Member Portal</button>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <button className="btn btn-ghost" onClick={fetchLexicon}><RefreshCw size={18} /></button>
                                                <button className="btn btn-primary" onClick={() => publishLexicon(lexicon)} disabled={busyId === 'saving_lexicon'}>
                                                    {busyId === 'saving_lexicon' ? <RefreshCw className="spin" size={18} /> : <Save size={18} />} Publish Changes
                                                </button>
                                            </div>
                                        </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', height: 'calc(100vh - 250px)' }}>
                                        {/* --- LIVE MOCKUP --- */}
                                        <div className="card shadow-lg" style={{ 
                                            background: 'var(--bg-body)', 
                                            border: '4px solid var(--border)', 
                                            borderRadius: 24, 
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            position: 'relative'
                                        }}>
                                            <div style={{ padding: '0.75rem 1.5rem', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
                                                <div style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-body)', borderRadius: 4, margin: '0 2rem' }}>
                                                    https://sacco-portal.local/dashboard/preview
                                                </div>
                                            </div>

                                            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', background: 'var(--bg-body)' }}>
                                                {/* --- MOCK DASHBOARD CONTENT --- */}
                                                {activePortal === 'admin' ? (
                                                    <div className="mock-dashboard">
                                                        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                                                            <EditableLabel labelKey="dashboard_title" defaultValue="Administrative Dashboard" lexicon={lexicon} setLexicon={setLexicon} />
                                                        </h1>
                                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '2rem' }}>
                                                            <EditableLabel labelKey="dashboard_subtitle" defaultValue="Real-time financial oversight and member analytics." lexicon={lexicon} setLexicon={setLexicon} />
                                                        </p>

                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                                                            <div className="card" style={{ background: 'var(--card-bg)', borderLeft: '4px solid var(--accent)' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                                                                    <EditableLabel labelKey="dashboard_members_label" defaultValue="Total Members" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0.4rem 0' }}>1,248</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="dashboard_members_desc" defaultValue="Active in system" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                            <div className="card" style={{ background: 'var(--card-bg)', borderLeft: '4px solid var(--success)' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                                                                    <EditableLabel labelKey="dashboard_capital_label" defaultValue="Total Capital" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0.4rem 0' }}>KES 4.2M</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="dashboard_capital_desc" defaultValue="Liquid assets" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                            <div className="card" style={{ background: 'var(--card-bg)', borderLeft: '4px solid var(--warning)' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                                                                    <EditableLabel labelKey="dashboard_loans_label" defaultValue="Active Loans" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0.4rem 0' }}>156</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="dashboard_loans_desc" defaultValue="Outstanding portfolio" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>
                                                            <EditableLabel labelKey="dashboard_funds_title" defaultValue="Institutional Fund Liquidity" lexicon={lexicon} setLexicon={setLexicon} />
                                                        </h3>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
                                                            {[1,2,3,4].map(i => (
                                                                <div key={i} className="card" style={{ padding: '0.75rem', background: 'var(--card-bg)', textAlign: 'center' }}>
                                                                    <div style={{ width: 32, height: 32, background: 'var(--accent-dim)', borderRadius: 8, margin: '0 auto 0.5rem' }} />
                                                                    <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>Fund Pool {i}</div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                                            <div className="card">
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                                                                    <EditableLabel labelKey="dashboard_personal_savings_label" defaultValue="Personal Savings" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0.4rem 0' }}>KES 1.2M</div>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="dashboard_personal_savings_desc" defaultValue="Flexible funds held in individual member wallets." lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                            <div className="card">
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                                                                    <EditableLabel labelKey="dashboard_pending_apps_label" defaultValue="Pending Loan Apps" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0.4rem 0' }}>12</div>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="dashboard_pending_apps_desc" defaultValue="New loan requests awaiting review and approval." lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                            <div className="card">
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                                                                    <EditableLabel labelKey="dashboard_interest_earned_label" defaultValue="Total Interest Earned" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0.4rem 0' }}>KES 850K</div>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="dashboard_interest_earned_desc" defaultValue="Realized profit generated from loan interest payments." lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mock-dashboard">
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                                            <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>👋 Hello, John</h2>
                                                            <div style={{ background: 'var(--accent-dim)', padding: '0.4rem 0.8rem', borderRadius: 20, fontSize: '0.65rem', fontWeight: 800 }}>MEMBER</div>
                                                        </div>

                                                        <div className="card shadow-sm" style={{ marginBottom: '2rem' }}>
                                                            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <Activity size={16} className="text-accent" />
                                                                <EditableLabel labelKey="member_performance_title" defaultValue="Portfolio Performance (Past 12 Months)" lexicon={lexicon} setLexicon={setLexicon} />
                                                            </h3>
                                                            <div style={{ height: 100, background: 'var(--bg-body)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                                                                Chart Visualization Mock
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                            <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                                                                    <EditableLabel labelKey="member_savings_label" defaultValue="SACCO Savings" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0.4rem 0' }}>KES 45,200</div>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="member_savings_desc" defaultValue="Institutional deposits and share capital." lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                                                                    <EditableLabel labelKey="member_wallet_label" defaultValue="Personal Wallet" lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                                <div style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0.4rem 0' }}>KES 12,800</div>
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                                    <EditableLabel labelKey="member_wallet_desc" defaultValue="Liquid funds for savings goals and instant withdrawals." lexicon={lexicon} setLexicon={setLexicon} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ position: 'absolute', bottom: '1.5rem', right: '1.5rem', background: 'var(--accent)', color: '#000', padding: '0.5rem 1rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800, boxShadow: '0 4px 15px rgba(var(--accent-rgb), 0.3)' }}>
                                                LIVE EDIT MODE ACTIVE
                                            </div>
                                        </div>

                                        {/* --- EDIT SIDEBAR --- */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div className="card shadow-sm" style={{ border: '1px solid var(--accent-dim)' }}>
                                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--accent)' }}>Editor Instructions</h3>
                                                <p style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                                    Click on any <strong>highlighted text</strong> in the mockup to edit it directly. Changes are stored locally until you click <strong>Publish</strong>.
                                                </p>
                                            </div>

                                            <div className="card shadow-sm">
                                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1rem' }}>Lexicon Statistics</h3>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                                                    <span>Total Overrides:</span>
                                                    <span style={{ fontWeight: 800 }}>{Object.keys(lexicon).length}</span>
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                                    Custom labels ensure the portal speaks your organization's language.
                                                </div>
                                            </div>

                                            <button className="btn btn-ghost" style={{ marginTop: 'auto' }} onClick={() => { if(window.confirm('Reset ALL custom labels to defaults? This cannot be undone.')) { setLexicon({}); publishLexicon({}); }}}>
                                                <RefreshCw size={14} /> Reset Lexicon
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'backups' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><HardDrive size={24} className="text-accent" /> Snapshot Registry</h2>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Managing redundant hardware backups and disaster recovery.</p>
                                        </div>
                                        <button className="btn btn-primary" onClick={createBackup} disabled={busyId === 'creating_backup'}>
                                            {busyId === 'creating_backup' ? <RefreshCw size={18} className="spin" /> : <Plus size={18} />} Generate Snapshot
                                        </button>
                                    </div>
                                    <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                                        <table className="table">
                                            <thead style={{ background: 'var(--bg-body)' }}>
                                                <tr><th>Snapshot Filename</th><th>Size</th><th>Timestamp</th><th style={{ textAlign: 'right' }}>Protocols</th></tr>
                                            </thead>
                                            <tbody>
                                                {backupData.backups.length === 0 ? <tr className="empty-row"><td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>No backups found in local storage.</td></tr> : (
                                                    backupData.backups.map(b => (
                                                        <tr key={b.filename}>
                                                            <td style={{ fontWeight: 800 }}>{b.filename}</td>
                                                            <td><span className="badge badge-accent">{b.sizeKB} KB</span></td>
                                                            <td><span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{new Date(b.createdAt).toLocaleString()}</span></td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                                    <a href={`/api/ict/backups/download/${b.filename}?token=${localStorage.getItem('mp_token')}`} className="btn btn-ghost btn-sm" title="Download"><Download size={16} /></a>
                                                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => deleteBackup(b.filename)}><Trash2 size={16} /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                    </motion.div>
                </AnimatePresence>
            </div>

            {/* --- MODALS --- */}
            {resetAdmin && <ResetPwdModal admin={resetAdmin} onClose={() => setResetAdmin(null)} onSaved={() => { setResetAdmin(null); showToast('Admin credentials rotated.'); }} />}
            {deleteAdmin && <ConfirmModal title="⚠ Purge Administrative Account" msg={`You are about to permanently revoke access and purge all metadata for "${deleteAdmin.username}". This action is logged and IRREVERSIBLE.`} onConfirm={executeDelete} onClose={() => setDeleteAdmin(null)} />}
            {showAddAdmin && <AddAdminModal onClose={() => setShowAddAdmin(false)} onSaved={() => { setShowAddAdmin(false); fetchAll(); showToast('Administrative principal provisioned.'); }} />}

            {/* --- NOTIFICATIONS --- */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={`toast toast-${toast.type}`}
                        style={{
                            position: 'fixed',
                            bottom: '2rem',
                            right: '2rem',
                            zIndex: 9999,
                            padding: '1rem 1.5rem',
                            borderRadius: 12,
                            background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
                            color: '#fff',
                            fontWeight: 700,
                            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}
                    >
                        {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- CORE STYLES --- */}
            <style dangerouslySetInnerHTML={{ __html: `
                .nav-link:hover { background: var(--bg-body) !important; color: var(--accent) !important; transform: translateX(4px); }
                .nav-link.active { background: var(--accent-dim) !important; color: var(--accent) !important; border-left: 3px solid var(--accent) !important; }
                .spin { animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .card { transition: all 0.2s ease-out; }
            `}} />
                </div>
            </div>

            {/* --- DATALIST --- */}
            <datalist id="role-options">
                <option value="superadmin">Full Administrator</option>
                <option value="ict_admin">ICT Ops Specialist</option>
                <option value="finance_admin">Finance Auditor</option>
                <option value="manager">Officer</option>
                <option value="secretary">Clerical Admin</option>
            </datalist>
        </div>
    );
};
export default function SystemControlWithErrorBoundary(props) {
    return (
        <ErrorBoundary>
            <SystemControl {...props} />
        </ErrorBoundary>
    );
}

