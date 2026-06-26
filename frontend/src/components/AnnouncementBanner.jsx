import { useEffect, useState } from 'react';
import { X, AlertTriangle, Info, AlertCircle } from 'lucide-react';

/**
 * AnnouncementBanner
 * Reads announcement settings from the global `features` object.
 * Hides itself once dismissed (per session) or if expired / not enabled.
 */
const AnnouncementBanner = ({ features }) => {
    const [visible, setVisible] = useState(false);

    const enabled   = features?.announcement_enabled === 'true';
    const message   = features?.announcement_message || '';
    const severity  = features?.announcement_severity || 'info';
    const expiresAt = features?.announcement_expires;

    useEffect(() => {
        if (!enabled || !message) return setVisible(false);
        if (expiresAt && new Date(expiresAt) < new Date()) return setVisible(false);
        // Don't show if user dismissed it in this session
        const dismissed = localStorage.getItem('banner_dismissed_' + message.slice(0, 20));
        setVisible(!dismissed);
    }, [enabled, message, expiresAt]);

    const dismiss = () => {
        localStorage.setItem('banner_dismissed_' + message.slice(0, 20), '1');
        setVisible(false);
    };

    if (!visible) return null;

    const styles = {
        info:    { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.4)',  color: '#818cf8', Icon: Info         },
        warning: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)',  color: '#fbbf24', Icon: AlertTriangle },
        critical:{ bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',   color: '#f87171', Icon: AlertCircle   },
    };
    const s = styles[severity] || styles.info;
    const Icon = s.Icon;

    // Calculate time remaining if expiresAt set
    let countdown = '';
    if (expiresAt) {
        const mins = Math.round((new Date(expiresAt) - new Date()) / 60000);
        if (mins > 0) countdown = ` • Expires in ${mins < 60 ? mins + ' min' : Math.round(mins/60) + ' hr'}`;
    }

    return (
        <div style={{
            position: 'sticky', top: 0, zIndex: 999,
            background: s.bg, borderBottom: `1px solid ${s.border}`,
            padding: '0.65rem 1.5rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            backdropFilter: 'blur(8px)',
        }}>
            <Icon size={16} style={{ color: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: s.color, flex: 1 }}>
                {message}{countdown}
            </span>
            <button
                onClick={dismiss}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.color, opacity: 0.7, padding: '0.2rem' }}
            >
                <X size={14} />
            </button>
        </div>
    );
};

export default AnnouncementBanner;
