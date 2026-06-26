import { useState, useEffect, useCallback } from 'react';
import { apiFetch, memberFetch } from '../utils/api';
import { Bell, Check, Calendar, Clock, ExternalLink, CreditCard, ShieldAlert, Award, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const NotificationsPage = ({ type = 'admin' }) => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [filter, setFilter] = useState('all'); // all, unread, read
    const fetcher = type === 'admin' ? apiFetch : memberFetch;
    const endpoint = type === 'admin' ? '/api/notifications' : '/api/member/notifications';

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetcher(endpoint);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
        setLoading(false);
    }, [fetcher, endpoint]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const markRead = async (id) => {
        try {
            await fetcher(`${endpoint}/${id}/read`, { method: 'PUT' });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n));
        } catch (err) { console.error(err); }
    };

    const markAllRead = async () => {
        if (notifications.every(n => n.isRead)) return;
        setProcessing(true);
        try {
            const res = await fetcher(`${endpoint}/read-all`, { method: 'POST' });
            if (res.ok) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to mark all as read');
            }
        } catch (err) { 
            console.error(err); 
            alert('Connection error. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    const getIcon = (notifType) => {
        switch (notifType) {
            case 'payment': return <CreditCard size={20} color="var(--success)" />;
            case 'security': return <ShieldAlert size={20} color="var(--danger)" />;
            case 'loan': return <Award size={20} color="var(--accent)" />;
            case 'support': return <MessageCircle size={20} color="var(--accent)" />;
            default: return <AlertCircle size={20} color="var(--text-dim)" />;
        }
    };

    const filtered = notifications.filter(n => {
        if (filter === 'unread') return !n.isRead;
        if (filter === 'read') return n.isRead;
        return true;
    });

    return (
        <div className="animate-in">
            <div className="section-header">
                <div>
                    <h1>🔔 Notifications Center</h1>
                    <p className="sub">Stay updated with the latest activities and alerts.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-ghost" onClick={fetchNotifications} disabled={loading || processing}>
                        <RefreshCw size={16} style={{ marginRight: '0.5rem' }} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                    <button 
                        className="btn btn-primary" 
                        onClick={markAllRead} 
                        disabled={processing || notifications.length === 0 || notifications.every(n => n.isRead)}
                    >
                        {processing ? (
                            <>⏳ Processing...</>
                        ) : (
                            <><Check size={16} style={{ marginRight: '0.5rem' }} /> Mark All as Read</>
                        )}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('all')}>All</button>
                <button className={`btn ${filter === 'unread' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('unread')}>
                    Unread {notifications.filter(n => !n.isRead).length > 0 && `(${notifications.filter(n => !n.isRead).length})`}
                </button>
                <button className={`btn ${filter === 'read' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter('read')}>Read</button>
            </div>

            <div className="card p-0 overflow-hidden">
                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                        <p>Loading your notifications...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '6rem 2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <Bell size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
                        <h3>No notifications found</h3>
                        <p>When there are updates or alerts, they will appear here.</p>
                    </div>
                ) : (
                    <div className="notification-list">
                        {filtered.map((n, idx) => (
                            <motion.div 
                                key={n.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                style={{ 
                                    padding: '1.5rem',
                                    borderBottom: '1px solid var(--border)',
                                    background: n.isRead ? 'transparent' : 'rgba(99, 102, 241, 0.03)',
                                    display: 'flex',
                                    gap: '1.25rem',
                                    position: 'relative',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ 
                                    padding: '0.75rem', 
                                    borderRadius: '12px', 
                                    background: 'var(--surface-2)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    height: 'fit-content'
                                }}>
                                    {getIcon(n.type)}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: n.isRead ? 'var(--text-dim)' : 'var(--text-primary)' }}>{n.title}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {new Date(n.timestamp).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <p style={{ margin: '0 0 1rem', lineHeight: 1.6, color: n.isRead ? 'var(--text-dim)' : 'var(--text-secondary)' }}>{n.message}</p>
                                    
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        {n.link && (
                                            <button 
                                                onClick={() => {
                                                    if (!n.isRead) markRead(n.id);
                                                    navigate(n.link);
                                                }} 
                                                className="btn btn-ghost btn-sm" 
                                                style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600, border: '1px solid var(--accent)' }}
                                            >
                                                View Details <ExternalLink size={14} style={{ marginLeft: '0.5rem' }} />
                                            </button>
                                        )}
                                        {!n.isRead && (
                                            <button 
                                                className="btn btn-ghost btn-sm" 
                                                onClick={() => markRead(n.id)}
                                                style={{ fontSize: '0.8rem' }}
                                            >
                                                Mark as read
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {!n.isRead && <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: 'var(--accent)' }} />}
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                .notification-list > div:last-child { border-bottom: none; }
                .notification-list > div:hover { background: rgba(255,255,255,0.02) !important; }
            `}</style>
        </div>
    );
};

export default NotificationsPage;
