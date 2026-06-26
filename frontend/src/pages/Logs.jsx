import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, downloadBlob } from '../utils/api';
import { 
    Search, 
    RefreshCw, 
    Download, 
    AlertCircle, 
    Mail, 
    FileText, 
    ChevronDown, 
    ChevronUp,
    CheckCircle2,
    XCircle,
    Info,
    Filter,
    Clipboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const Logs = () => {
    const [tab, setTab]             = useState('sms');
    const [smsLogs, setSmsLogs]     = useState([]);
    const [actLogs, setActLogs]     = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [expanded, setExpanded]   = useState(null);
    const [search, setSearch]       = useState('');

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [sRes, aRes] = await Promise.all([
                apiFetch('/api/sms/logs'),
                apiFetch('/api/activity-log')
            ]);
            
            const sData = await sRes.json().catch(() => ({ logs: [] }));
            const aData = await aRes.json().catch(() => ({ logs: [] }));
            
            // Defensive assignment
            const sLogs = sData?.logs || (Array.isArray(sData) ? sData : []);
            const aLogs = aData?.logs || (Array.isArray(aData) ? aData : []);

            setSmsLogs(Array.isArray(sLogs) ? sLogs : []);
            setActLogs(Array.isArray(aLogs) ? aLogs : []);
        } catch (err) {
            console.error('[LOGS] Critical failure:', err);
            setError('Unable to load logs. Please ensure the backend is running on port 5001.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { 
        fetchAll(); 
    }, [fetchAll]);

    const actionColor = (action) => {
        if (!action) return 'var(--text-secondary)';
        const act = String(action).toLowerCase();
        if (act.includes('delete') || act.includes('remove') || act.includes('fail')) return '#ef4444'; // red-500
        if (act.includes('create') || act.includes('import') || act.includes('success')) return '#22c55e'; // green-500
        if (act.includes('login')) return '#6366f1'; // indigo-500
        if (act.includes('recovery') || act.includes('security') || act.includes('code')) return '#8b5cf6'; // violet-500
        if (act.includes('update') || act.includes('edit')) return '#f59e0b'; // amber-500
        return 'var(--text-secondary)';
    };

    const recipientsList = (raw) => {
        if (!raw) return '—';
        try { 
            const p = typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{')) ? JSON.parse(raw) : raw; 
            return Array.isArray(p) ? p.join(', ') : String(raw); 
        }
        catch { return String(raw); }
    };

    const filteredSms = smsLogs.filter(l => {
        const s = search.toLowerCase();
        return (l.type || '').toLowerCase().includes(s) ||
               (l.message || '').toLowerCase().includes(s) ||
               (l.recipients || '').toLowerCase().includes(s) ||
               (l.status || '').toLowerCase().includes(s);
    });

    const filteredAct = actLogs.filter(l => {
        const s = search.toLowerCase();
        return (l.action || '').toLowerCase().includes(s) ||
               (l.entity || '').toLowerCase().includes(s) ||
               (l.details || '').toLowerCase().includes(s) ||
               (l.performed_by || '').toLowerCase().includes(s);
    });

    if (error) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '4rem', border: '1px solid #fee2e2', background: '#fef2f2' }}>
                <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
                <h3 style={{ color: '#991b1b' }}>Service Unavailable</h3>
                <p style={{ color: '#b91c1c', marginBottom: '1.5rem' }}>{error}</p>
                <button className="btn btn-primary" onClick={fetchAll}>
                    <RefreshCw size={16} /> Try Again
                </button>
            </div>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText className="text-accent" /> System Audit Trail
                    </h2>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Monitoring gateway communications and administrative operations.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                        <input 
                            type="text" 
                            className="input" 
                            placeholder="Search logs..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: '2.75rem', width: '250px', height: '42px' }}
                        />
                    </div>
                    <button className="btn btn-ghost" onClick={fetchAll} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                    <div className="dropdown" style={{ position: 'relative' }}>
                        <button className="btn btn-primary">
                            <Download size={18} /> Export
                        </button>
                        <div className="dropdown-content">
                            <button onClick={() => downloadBlob('/api/export/activity-log.csv', 'activity_log.csv')}>CSV Format</button>
                            <button onClick={() => downloadBlob('/api/export/activity-log.pdf', 'activity_log.pdf')}>PDF Report</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="tab-bar" style={{ marginBottom: '1.5rem', background: 'var(--bg-card)', padding: '0.35rem', borderRadius: '12px', display: 'inline-flex', gap: '0.25rem', border: '1px solid var(--border)' }}>
                <button 
                    className={`tab-btn ${tab === 'sms' ? 'active' : ''}`} 
                    onClick={() => setTab('sms')}
                    style={{ borderRadius: '8px', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Mail size={16} /> SMS Gateway
                    <span style={{ fontSize: '0.7rem', background: tab === 'sms' ? 'var(--accent)' : 'var(--bg-body)', color: tab === 'sms' ? 'white' : 'var(--text-secondary)', padding: '0.1rem 0.4rem', borderRadius: '10px', marginLeft: '0.25rem' }}>
                        {smsLogs.length}
                    </span>
                </button>
                <button 
                    className={`tab-btn ${tab === 'activity' ? 'active' : ''}`} 
                    onClick={() => setTab('activity')}
                    style={{ borderRadius: '8px', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Clipboard size={16} /> Admin Activity
                    <span style={{ fontSize: '0.7rem', background: tab === 'activity' ? 'var(--accent)' : 'var(--bg-body)', color: tab === 'activity' ? 'white' : 'var(--text-secondary)', padding: '0.1rem 0.4rem', borderRadius: '10px', marginLeft: '0.25rem' }}>
                        {actLogs.length}
                    </span>
                </button>
            </div>

            <div>
                {tab === 'sms' ? (
                    <motion.div 
                        key="sms-tab"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="card"
                        style={{ padding: 0, overflow: 'hidden' }}
                    >
                        <div className="table-wrap">
                            <table className="table-hover">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}></th>
                                        <th>Type</th>
                                        <th>Recipients</th>
                                        <th>Message</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Date & Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => <tr key={i} className="skeleton-row"><td colSpan="6" style={{ height: '56px' }}></td></tr>)
                                    ) : filteredSms.length === 0 ? (
                                        <tr className="empty-row"><td colSpan="6" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                                            <Info size={32} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                                            <p>No SMS logs found matching your criteria.</p>
                                        </td></tr>
                                    ) : filteredSms.map(l => (
                                        <React.Fragment key={l.id}>
                                            <tr 
                                                onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                                                className={expanded === l.id ? 'row-expanded' : ''}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <td>
                                                    {expanded === l.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </td>
                                                <td>
                                                    <span className="badge" style={{
                                                        background: (l.type || '').includes('bulk') ? 'rgba(99,102,241,0.1)' : (l.type || '').includes('overdue') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                                        color: (l.type || '').includes('bulk') ? '#6366f1' : (l.type || '').includes('overdue') ? '#ef4444' : '#22c55e',
                                                        fontWeight: 600, fontSize: '0.7rem'
                                                    }}>
                                                        {(l.type || 'unknown').toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="td-muted" title={recipientsList(l.recipients)}>
                                                    <div style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {recipientsList(l.recipients)}
                                                    </div>
                                                </td>
                                                <td title={l.message}>
                                                    <div style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {l.message || '—'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: ['sent', 'success'].includes(l.status) ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                                        {['sent', 'success'].includes(l.status) ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                                        {(['sent', 'success'].includes(l.status) ? 'Sent' : 'Failed')}
                                                    </div>
                                                </td>
                                                <td className="td-muted" style={{ textAlign: 'right' }}>{fmtTime(l.timestamp)}</td>
                                            </tr>
                                            <AnimatePresence>
                                                {expanded === l.id && (
                                                    <motion.tr 
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        style={{ background: 'var(--bg-body)' }}
                                                    >
                                                        <td colSpan="6" style={{ padding: '1.25rem 2rem' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
                                                                <div>
                                                                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Message Content</h4>
                                                                    <div className="card" style={{ background: 'var(--bg-card)', padding: '1rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                                                        {l.message}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Delivery Breakdown</h4>
                                                                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                                                                        {(() => {
                                                                            try {
                                                                                const details = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
                                                                                if (!details || (Array.isArray(details) && details.length === 0)) return <p className="text-muted italic">No granular delivery data available.</p>;
                                                                                const items = Array.isArray(details) ? details : [details];
                                                                                return items.map((d, i) => (
                                                                                    <div key={i} className="card" style={{ padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${d.status === 'sent' ? '#22c55e' : '#ef4444'}`, background: 'var(--bg-card)' }}>
                                                                                        <div>
                                                                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.number}</span>
                                                                                            {d.failureReason && <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontSize: '0.75rem' }}>({d.failureReason})</span>}
                                                                                        </div>
                                                                                        <div style={{ textAlign: 'right' }}>
                                                                                            <div style={{ color: d.status === 'sent' ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: '0.75rem' }}>{(d.status || 'UNKNOWN').toUpperCase()}</div>
                                                                                            {d.cost && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{d.cost}</div>}
                                                                                        </div>
                                                                                    </div>
                                                                                ));
                                                                            } catch (e) {
                                                                                return <div className="card" style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{String(l.details)}</div>;
                                                                            }
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                )}
                                            </AnimatePresence>
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="act-tab"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="card"
                        style={{ padding: 0, overflow: 'hidden' }}
                    >
                        <div className="table-wrap">
                            <table className="table-hover">
                                <thead>
                                    <tr>
                                        <th>Action</th>
                                        <th>Entity</th>
                                        <th>Change Details</th>
                                        <th>Performed By</th>
                                        <th style={{ textAlign: 'right' }}>Date & Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => <tr key={i} className="skeleton-row"><td colSpan="5" style={{ height: '56px' }}></td></tr>)
                                    ) : filteredAct.length === 0 ? (
                                        <tr className="empty-row"><td colSpan="5" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                                            <Info size={32} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                                            <p>No activity records found matching your search.</p>
                                        </td></tr>
                                    ) : filteredAct.map(l => (
                                        <tr key={l.id}>
                                            <td>
                                                <span 
                                                    style={{ 
                                                        color: actionColor(l.action), 
                                                        fontWeight: 700, 
                                                        fontSize: '0.75rem', 
                                                        background: `${actionColor(l.action)}20`, 
                                                        padding: '0.2rem 0.5rem', 
                                                        borderRadius: '4px' 
                                                    }}
                                                >
                                                    {(l.action || 'Unknown').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 500 }}>
                                                {l.entity || '—'}
                                                {l.entity_id && <span style={{ marginLeft: '0.4rem', opacity: 0.5, fontSize: '0.8rem' }}>#{l.entity_id}</span>}
                                            </td>
                                            <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.details}>
                                                {l.details || '—'}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.7rem', fontWeight: 'bold' }}>
                                                        {(l.performed_by || 'A')[0].toUpperCase()}
                                                    </div>
                                                    <span style={{ fontSize: '0.85rem' }}>{l.performed_by || 'System'}</span>
                                                </div>
                                            </td>
                                            <td className="td-muted" style={{ textAlign: 'right' }}>{fmtTime(l.timestamp)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .row-expanded { background: rgba(var(--accent-rgb), 0.03) !important; }
                .row-expanded td { border-bottom: none !important; }
                .tab-btn.active span { background: white !important; color: var(--accent) !important; }
                .skeleton-row { animation: pulse 1.5s infinite ease-in-out; background: var(--bg-body); }
                @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
                .dropdown-content { display: none; position: absolute; right: 0; background-color: var(--bg-card); min-width: 160px; box-shadow: var(--shadow-lg); border-radius: 8px; z-index: 10; border: 1px solid var(--border); overflow: hidden; margin-top: 0.5rem; }
                .dropdown:hover .dropdown-content { display: block; }
                .dropdown-content button { color: var(--text-primary); padding: 10px 16px; text-decoration: none; display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-size: 0.9rem; }
                .dropdown-content button:hover { background-color: var(--bg-body); color: var(--accent); }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}} />
        </motion.div>
    );
};

export default Logs;
