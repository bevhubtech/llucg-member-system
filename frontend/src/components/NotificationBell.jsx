import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, BellRing, X, Check, CreditCard, ShieldAlert, Award, MessageCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, memberFetch } from '../utils/api';
import { useNavigate } from 'react-router-dom';

const NotificationBell = ({ type = 'admin' }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    const fetcher = type === 'admin' ? apiFetch : memberFetch;
    const endpoint = type === 'admin' ? '/api/notifications' : '/api/member/notifications';

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetcher(endpoint);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    }, [fetcher]);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // 30s polling
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markRead = async (id) => {
        try {
            await fetcher(`${endpoint}/${id}/read`, { method: 'PUT' });
            fetchNotifications();
        } catch (err) { console.error(err); }
    };

    const markAllRead = async () => {
        setLoading(true);
        try {
            await fetcher(`${endpoint}/read-all`, { method: 'POST' });
            fetchNotifications();
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const getIcon = (type) => {
        switch (type) {
            case 'payment': return <CreditCard size={16} color="var(--success)" />;
            case 'security': return <ShieldAlert size={16} color="var(--danger)" />;
            case 'loan': return <Award size={16} color="var(--accent)" />;
            case 'support': return <MessageCircle size={16} color="var(--accent)" />;
            default: return <AlertCircle size={16} color="var(--text-dim)" />;
        }
    };

    return (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button 
                className="btn btn-ghost btn-icon" 
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                style={{ 
                    position: 'relative', 
                    borderRadius: '50%', 
                    padding: '0.6rem',
                    background: open ? 'var(--hover-bg)' : 'transparent',
                    border: '1px solid var(--border)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    width: 40, height: 40
                }}
            >
                {unreadCount > 0 ? (
                    <motion.div
                        animate={{ rotate: [0, -10, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                    >
                        <BellRing size={20} color="var(--accent)" />
                    </motion.div>
                ) : (
                    <Bell size={20} />
                )}
                
                <AnimatePresence>
                    {unreadCount > 0 && (
                        <motion.span 
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            style={{ 
                                position: 'absolute', 
                                top: -2, 
                                right: -2, 
                                background: 'var(--danger)', 
                                color: '#fff', 
                                borderRadius: '50%', 
                                width: 18, 
                                height: 18, 
                                fontSize: '0.65rem', 
                                fontWeight: 800,
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                boxShadow: '0 0 10px rgba(220, 38, 38, 0.5)',
                                border: '2px solid var(--bg)'
                            }}
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </motion.span>
                    )}
                </AnimatePresence>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{ 
                            position: 'absolute', 
                            top: '120%', 
                            right: 0, 
                            width: 340, 
                            maxHeight: 480, 
                            background: 'var(--surface)', 
                            border: '1px solid var(--border)', 
                            borderRadius: 16, 
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)', 
                            zIndex: 10000, 
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Activity & Alerts</h4>
                            {unreadCount > 0 && (
                                <button 
                                    onClick={markAllRead}
                                    disabled={loading}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <Check size={12} /> Mark all read
                                </button>
                            )}
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem' }} className="custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', opacity: 0.5 }}>
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 }}>
                                        <Bell size={40} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.2 }} />
                                    </motion.div>
                                    <p style={{ fontSize: '0.82rem' }}>You're all caught up!</p>
                                </div>
                            ) : (
                                notifications.map((n, idx) => (
                                    <motion.div 
                                        key={n.id} 
                                        initial={{ x: -10, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        style={{ 
                                            padding: '0.85rem 1rem', 
                                            borderRadius: 10,
                                            background: n.isRead ? 'transparent' : 'rgba(99, 102, 241, 0.05)',
                                            marginBottom: '0.25rem',
                                            cursor: 'pointer',
                                            borderLeft: n.isRead ? '3px solid transparent' : '3px solid var(--accent)',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            gap: '0.75rem',
                                        }}
                                        onClick={() => { 
                                            if (!n.isRead) markRead(n.id); 
                                            if (n.link && window.location.pathname !== n.link) {
                                                setOpen(false);
                                                navigate(n.link);
                                            }
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = n.isRead ? 'transparent' : 'rgba(99, 102, 241, 0.05)'}
                                    >
                                        <div style={{ marginTop: '0.1rem', padding: '0.45rem', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {getIcon(n.type)}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: n.isRead ? 'var(--text-dim)' : 'var(--text-primary)' }}>{n.title}</p>
                                                {!n.isRead && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 4 }} />}
                                            </div>
                                            <p style={{ margin: '0.25rem 0 0.4rem', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.45 }}>{n.message}</p>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                                                    {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(n.timestamp).toLocaleDateString()}
                                                </p>
                                                {n.link && <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>Details <ExternalLink size={8} /></span>}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>

                        {notifications.length > 0 && (
                            <div style={{ padding: '0.85rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.01)' }}>
                                <button 
                                    className="btn btn-primary btn-sm" 
                                    style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700 }}
                                    onClick={() => { setOpen(false); navigate(type === 'admin' ? '/notifications' : '/member/notifications'); }}
                                >
                                    View All Notifications
                                </button>
                                <button 
                                    className="btn-link" 
                                    style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                                    onClick={() => { setOpen(false); markAllRead(); }}
                                >
                                    Dismiss all notifications
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationBell;
