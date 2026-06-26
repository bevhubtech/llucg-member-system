import { useState, useEffect } from 'react';
import { 
    Settings as SettingsIcon, Globe, DollarSign, Calendar, 
    Bell, ShieldAlert, Save, RefreshCcw, Info, 
    Smartphone, AlertCircle, Clock, CheckCircle2, BarChart3,
    Fingerprint, ShieldCheck, X, LifeBuoy
} from 'lucide-react';
import { apiFetch } from '../utils/api';

const FIELDS = [
    { key: 'group_name',               label: 'Group Name',                     type: 'text',   placeholder: 'LIFE-LONG UNITY CAPITAL GROUP (LLUCG)', icon: Globe },
    { key: 'currency',                 label: 'Currency Symbol',                type: 'text',   placeholder: 'KES', icon: DollarSign },
    { key: 'contribution_target',      label: 'Monthly Contribution Target',    type: 'number', placeholder: '5000', icon: BarChart3 }, 
    { key: 'registration_fee_amount',  label: 'Registration Fee Amount',        type: 'number', placeholder: '500', icon: DollarSign },
    { key: 'welfare_contribution_amount', label: 'Monthly Welfare Contribution', type: 'number', placeholder: '100', icon: LifeBuoy },
    { key: 'late_fee_amount',          label: 'Late Fee Amount',                type: 'number', placeholder: '200', icon: AlertCircle },
    { key: 'auto_penalty_enabled',     label: 'Auto-Penalty Enabled',           type: 'select', options: ['false','true'], icon: ShieldAlert },
    { key: 'auto_penalty_amount',      label: 'Auto-Penalty Amount',            type: 'number', placeholder: '200', icon: DollarSign },
    { key: 'auto_penalty_days_overdue',label: 'Auto-Penalty Days Overdue',      type: 'number', placeholder: '7', icon: Clock },
    { key: 'penalty_grace_period',     label: 'Penalty Grace Period (Days)',     type: 'number', placeholder: '0', icon: Calendar },
    { key: 'penalty_sms_enabled',      label: 'Send penalty SMS alert?',         type: 'select', options: ['true','false'], icon: Bell },
    { key: 'reminder_days_before',     label: 'Reminder Days Before Due Date',  type: 'number', placeholder: '3', icon: Bell },
    { key: 'reminder_days_after',      label: 'Reminder Days After Due Date',   type: 'number', placeholder: '1', icon: Bell },
];

const Settings = () => {
    const [form,    setForm]    = useState({});
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [toast,   setToast]   = useState(null);
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [showTwoFAModal, setShowTwoFAModal] = useState(false);
    const [setupData, setSetupData] = useState(null);
    const [otp, setOtp] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [adminPhone, setAdminPhone] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [twoFAMethod, setTwoFAMethod] = useState('totp');
    const [sendingSms, setSendingSms] = useState(false);
    const [setupMethod, setSetupMethod] = useState('totp'); // 'totp' or 'sms'
    const [showDisableModal, setShowDisableModal] = useState(false);
    const [disableOtp, setDisableOtp] = useState('');
    const [disabling, setDisabling] = useState(false);

    useEffect(() => {
        Promise.all([
            apiFetch('/api/settings').then(r => r.json()),
            apiFetch('/api/auth/2fa/status').then(r => r.json()),
            apiFetch('/api/auth/me').then(r => r.json()),
            apiFetch('/api/auth/users').then(r => r.json()).catch(() => ({ users: [] }))
        ]).then(([sData, aData, meData, usersData]) => {
            setForm(sData.settings || {});
            setTwoFAEnabled(aData.enabled);
            setTwoFAMethod(aData.method || 'totp');
            
            // Find current admin's phone/email from users list or me data if available
            const me = usersData.users?.find(u => u.id === meData.id) || meData;
            setAdminPhone(me.phone || '');
            setAdminEmail(me.email || '');
            
            setLoading(false);
        }).catch(err => {
            setToast({ type: 'error', msg: err.message });
            setLoading(false);
        });
    }, []);

    const handle = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async (e) => {
        e.preventDefault();
        setSaving(true); setToast(null);
        try {
            // 1. Save system settings
            const r = await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify({ settings: form }) });
            if (!r.ok) throw new Error((await r.json()).error);
            
            // 2. Save admin profile (phone/email)
            const rp = await apiFetch('/api/auth/me', { method: 'PUT', body: JSON.stringify({ phone: adminPhone, email: adminEmail }) });
            if (!rp.ok) throw new Error((await rp.json()).error);

            setToast({ type: 'success', msg: 'All changes saved successfully.' });
        } catch (err) { setToast({ type: 'error', msg: err.message }); }
        setSaving(false);
        setTimeout(() => setToast(null), 3000);
    };

    const start2FASetup = async (method = 'totp') => {
        setSetupMethod(method);
        try {
            const res = await apiFetch('/api/auth/2fa/setup', { method: 'POST' });
            const data = await res.json();
            setSetupData(data);
            setShowTwoFAModal(true);
            setOtp('');
        } catch (err) { 
            console.error('2FA Setup failed:', err);
            setToast({ type: 'error', msg: `Failed to start 2FA setup: ${err.message}` }); 
        }
    };

    const requestSmsCode = async () => {
        if (!adminPhone) return setToast({ type: 'error', msg: 'Please save your phone number first.' });
        setSendingSms(true);
        try {
            const res = await apiFetch('/api/auth/2fa/sms/request', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setToast({ type: 'success', msg: 'Code sent to your phone!' });
        } catch (err) { setToast({ type: 'error', msg: err.message }); }
        setSendingSms(false);
    };

    const verifyAndEnable = async () => {
        setVerifying(true);
        try {
            const res = await apiFetch('/api/auth/2fa/enable', { 
                method: 'POST', 
                body: JSON.stringify({ token: otp, method: setupMethod }) 
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setTwoFAEnabled(true);
            setTwoFAMethod(setupMethod);
            setShowTwoFAModal(false);
            setToast({ type: 'success', msg: `2FA (${setupMethod === 'totp' ? 'App' : 'SMS'}) enabled successfully!` });
        } catch (err) { setToast({ type: 'error', msg: err.message }); }
        setVerifying(false);
    };

    const disable2FA = async () => {
        setDisabling(true);
        try {
            const res = await apiFetch('/api/auth/2fa/disable', { 
                method: 'POST', 
                body: JSON.stringify({ token: disableOtp }) 
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setTwoFAEnabled(false);
            setShowDisableModal(false);
            setDisableOtp('');
            setToast({ type: 'success', msg: '2FA disabled.' });
        } catch (err) { setToast({ type: 'error', msg: err.message }); }
        setDisabling(false);
    };

    if (loading) return <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Loading configuration…</p></div>;

    const renderField = (f) => (
        <div key={f.key} className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>{f.label}</span>
            </label>
            {f.type === 'select' ? (
                <select 
                    value={form[f.key] ?? ''} 
                    onChange={e => handle(f.key, e.target.value)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                    {f.options.map(o => <option key={o} value={o}>{o === 'true' ? 'Enabled / Yes' : 'Disabled / No'}</option>)}
                </select>
            ) : (
                <input 
                    type={f.type} 
                    value={form[f.key] ?? ''} 
                    onChange={e => handle(f.key, e.target.value)} 
                    placeholder={f.placeholder} 
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                />
            )}
        </div>
    );

    return (
        <div>
            <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                        <SettingsIcon size={24} />
                    </div>
                    <div>
                        <h2 style={{ marginBottom: 2 }}>System Configuration</h2>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>Manage group rules, penalties, and automated triggers</p>
                    </div>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1.5rem' }}>
                {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{toast.msg}</span>
            </div>}

            <form onSubmit={save} style={{ maxWidth: 900 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* General & Group */}
                    <div className="card" style={{ height: 'fit-content' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            <Globe size={18} className="text-secondary" />
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>General Settings</h3>
                        </div>
                        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                            {renderField(FIELDS[0])}
                            {renderField(FIELDS[1])}
                            {renderField(FIELDS[2])}
                        </div>
                    </div>

                    {/* Admin Profile */}
                    <div className="card" style={{ height: 'fit-content' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            <Smartphone size={18} className="text-secondary" />
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Admin Profile</h3>
                        </div>
                        <div className="form-group">
                            <label>Your Phone Number (for SMS notifications/2FA)</label>
                            <input 
                                value={adminPhone} 
                                onChange={e => setAdminPhone(e.target.value)}
                                placeholder="e.g. 254700000000"
                                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                            />
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                Format: 254XXXXXXXXX. Critical for SMS 2FA.
                            </p>
                        </div>
                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label>Your Email Address (for recovery/verification)</label>
                            <input 
                                type="email"
                                value={adminEmail} 
                                onChange={e => setAdminEmail(e.target.value)}
                                placeholder="e.g. admin@example.com"
                                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                            />
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                Used for password recovery and email-based 2FA.
                            </p>
                        </div>
                    </div>

                    {/* Security Card */}
                    <div className="card" style={{ height: 'fit-content' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            <Fingerprint size={18} className="text-secondary" />
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Two-Factor Authentication</h3>
                        </div>
                        <div style={{ padding: '0.5rem 0' }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                Secure your account using either a mobile authenticator app (TOTP) or SMS verification.
                            </p>
                            
                            {twoFAEnabled ? (
                                <div style={{ background: 'rgba(22, 163, 74, 0.1)', border: '1px solid rgba(22, 163, 74, 0.2)', padding: '1rem', borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <ShieldCheck size={24} style={{ color: '#16a34a' }} />
                                    <div style={{ flex: 1 }}>
                                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>2FA Active ({twoFAMethod === 'totp' ? 'App' : 'SMS'})</strong>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Enhanced protection is active.</span>
                                    </div>
                                    <button type="button" onClick={() => setShowDisableModal(true)} className="btn btn-ghost" style={{ color: '#ef4444', fontSize: '0.75rem' }}>Disable</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button type="button" onClick={() => start2FASetup('totp')} className="btn btn-primary" style={{ width: '100%', gap: '0.5rem' }}>
                                        <Smartphone size={18} />
                                        <span>Use Authenticator App</span>
                                    </button>
                                    <button type="button" onClick={() => start2FASetup('sms')} className="btn btn-ghost" style={{ width: '100%', gap: '0.5rem' }}>
                                        <Bell size={18} />
                                        <span>Use SMS Verification</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Automation & Penalties */}
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            <ShieldAlert size={18} className="text-secondary" />
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Penalty Engine</h3>
                        </div>
                        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                            {renderField(FIELDS[3])}
                            {renderField(FIELDS[4])}
                            {renderField(FIELDS[5])}
                            {renderField(FIELDS[6])}
                            {renderField(FIELDS[7])}
                        </div>
                    </div>

                    {/* Notifications */}
                    <div className="card" style={{ height: 'fit-content' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            <Bell size={18} className="text-secondary" />
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>SMS Notifications</h3>
                        </div>
                        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                            {renderField(FIELDS[8])}
                            {renderField(FIELDS[9])}
                            {renderField(FIELDS[10])}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 180, padding: '0.8rem 1.5rem', fontSize: '0.95rem' }}>
                        {saving ? <RefreshCcw size={18} className="spin" /> : <Save size={18} />}
                        <span>Save Changes</span>
                    </button>
                </div>
            </form>

            {/* 2FA SETUP MODAL */}
            {showTwoFAModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0 }}>Configure {setupMethod === 'totp' ? 'App' : 'SMS'} 2FA</h3>
                            <button onClick={() => setShowTwoFAModal(false)} className="btn-icon"><X size={20}/></button>
                        </div>
                        
                        {setupMethod === 'totp' ? (
                            <>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                    Scan this QR code with Google Authenticator, Authy, or any TOTP app.
                                </p>
                                <div style={{ background: '#fff', padding: '1rem', borderRadius: 8, display: 'inline-block', marginBottom: '1.5rem' }}>
                                    <img src={setupData?.qrCode} alt="2FA QR Code" style={{ width: 200, height: 200 }} />
                                </div>
                            </>
                        ) : (
                            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    We will send a 6-digit code to <strong>{adminPhone}</strong>.
                                </p>
                                <button 
                                    onClick={requestSmsCode} 
                                    disabled={sendingSms}
                                    className="btn btn-ghost" 
                                    style={{ width: '100%', border: '1px solid var(--border)', marginTop: '0.5rem' }}
                                >
                                    {sendingSms ? 'Sending…' : 'Send Verification Code'}
                                </button>
                            </div>
                        )}
                        
                        <div className="form-group" style={{ textAlign: 'left' }}>
                            <label>Verification Code</label>
                            <input 
                                value={otp} 
                                onChange={e => setOtp(e.target.value)}
                                placeholder="000000"
                                maxLength="6"
                                style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.5rem' }}
                            />
                        </div>
                        
                        <button 
                            type="button" 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '1rem' }}
                            disabled={verifying || otp.length < 6}
                            onClick={verifyAndEnable}
                        >
                            {verifying ? 'Verifying…' : 'Verify and Enable'}
                        </button>
                    </div>
                </div>
            )}
            {showDisableModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0 }}>Disable 2FA</h3>
                            <button onClick={() => setShowDisableModal(false)} className="btn-icon"><X size={20}/></button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            Enter the code from your authenticator {twoFAMethod === 'totp' ? 'app' : 'phone'} to disable Two-Factor Authentication.
                        </p>
                        <div className="form-group" style={{ textAlign: 'left' }}>
                            <label>Verification Code</label>
                            <input 
                                value={disableOtp} 
                                onChange={e => setDisableOtp(e.target.value)}
                                placeholder="000000"
                                maxLength="6"
                                style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.5rem' }}
                            />
                        </div>
                        <button 
                            type="button" 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '1rem', background: '#ef4444', borderColor: '#ef4444' }}
                            disabled={disabling || disableOtp.length < 6}
                            onClick={disable2FA}
                        >
                            {disabling ? 'Disabling…' : 'Confirm and Disable'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;
