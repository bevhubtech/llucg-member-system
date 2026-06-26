import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Smartphone, Mail } from 'lucide-react';
import { setMemberToken, setMemberName } from '../utils/api';
import logo from '../assets/logo.png';


const MemberLogin = () => {
    const [view, setView] = useState('login'); // 'login', 'forgot', 'reset'
    const [form, setForm] = useState({ phone: '', pin: '' });
    const [forgotPhone, setForgotPhone] = useState('');
    const [resetForm, setResetForm] = useState({ otp: '', newPin: '', confirmPin: '' });
    const [twoFAMemberId, setTwoFAMemberId] = useState(null);
    const [twoFAMethod, setTwoFAMethod] = useState('totp'); // 'totp' or 'sms'
    const [otp, setOtp] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [showNewPin, setShowNewPin] = useState(false);
    const [showConfirmPin, setShowConfirmPin] = useState(false);
    const [err,  setErr]  = useState('');
    const [toast, setToast] = useState(null);
    const [busy, setBusy] = useState(false);
    const [maintenance, setMaintenance] = useState(false);
    const [mtResolution, setMtResolution] = useState('shortly');
    const [mtMessage, setMtMessage] = useState('The Member Portal is currently undergoing essential system maintenance.');
    const [deliveryMethod, setDeliveryMethod] = useState('sms');
    const [features, setFeatures] = useState({});
    const navigate = useNavigate();

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 5000);
    };

    useEffect(() => {
        document.title = "Member Portal | LIFE-LONG UNITY";
        // Initial maintenance check via public endpoint
        fetch('/api/system/status')
            .then(r => r.json())
            .then(data => {
                if (data.enabled || data.maintenanceMode) {
                    setMaintenance(true);
                    setMtResolution(data.resolution || data.maintenanceResolution || 'shortly');
                    if (data.message || data.maintenanceMessage) setMtMessage(data.message || data.maintenanceMessage);
                }
                if (data.features) {
                    setFeatures(data.features);
                }
            })
            .catch(() => {}); 
    }, []);

    const safeJson = async (r) => { try { return await r.json(); } catch { return {}; } };

    const h = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    const hr = e => setResetForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await fetch(`/api/member/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: form.phone.replace(/\s+/g,''), pin: form.pin }),
            });
            const d = await safeJson(r);
            if (r.status === 503) {
                setMaintenance(true);
                if (d.resolution) setMtResolution(d.resolution);
                if (d.message) setMtMessage(d.message);
                throw new Error(d.message);
            }
            if (!r.ok) throw new Error(d.error);

            if (d.requires2FA) {
                setTwoFAMemberId(d.memberId);
                setTwoFAMethod(d.method);
                setView('2fa');
                setBusy(false);
                return;
            }

            setMemberToken(d.token);
            setMemberName(d.name);
            if (d.mustChangePassword) localStorage.setItem('member_must_change_password', 'true');
            else localStorage.removeItem('member_must_change_password');
            navigate('/member/portal');
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    const handle2FAVerify = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await fetch(`/api/member/login/2fa/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: twoFAMemberId, token: otp }),
            });
            const d = await safeJson(r);
            if (!r.ok) throw new Error(d.error);

            setMemberToken(d.token);
            setMemberName(d.name);
            if (d.mustChangePassword) localStorage.setItem('member_must_change_password', 'true');
            else localStorage.removeItem('member_must_change_password');
            navigate('/member/portal');
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    const handleForgotRequest = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const r = await fetch(`/api/member/forgot-password/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: forgotPhone.replace(/\s+/g,''), deliveryMethod }),
            });
            const d = await safeJson(r);
            if (!r.ok) throw new Error(d.error);
            showToast(d.message);
            setView('reset');
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    const handleResendOTP = async (method) => {
        setBusy(true); setErr('');
        try {
            const token = localStorage.getItem('mp_token');
            const r = await fetch(`/api/member/2fa/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ method }),
            });
            const d = await safeJson(r);
            if (!r.ok) throw new Error(d.error);
            showToast(d.message);
            setTwoFAMethod(method);
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault(); setErr('');
        if (resetForm.newPin !== resetForm.confirmPin) return setErr('Passwords do not match.');
        
        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passRegex.test(resetForm.newPin)) {
            return setErr('Password must be 8+ chars with uppercase, lowercase, numbers, and symbols.');
        }

        setBusy(true);
        try {
            const r = await fetch(`/api/member/forgot-password/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phone: forgotPhone.replace(/\s+/g,''), 
                    otp: resetForm.otp, 
                    newPassword: resetForm.newPin 
                }),
            });
            const d = await safeJson(r);
            if (!r.ok) throw new Error(d.error);
            showToast(d.message);
            setView('login');
            setForm({ ...form, phone: forgotPhone });
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
            {maintenance && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--surface)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' }}>
                    <div style={{ maxWidth: 450 }}>
                        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'var(--surface-2)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', border: '1px solid var(--border)' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        </div>
                        <h2 style={{ color: 'var(--warning)', marginBottom: '1rem', fontWeight: 800 }}>Scheduled System Maintenance</h2>
                        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '2rem', fontSize: '0.95rem' }}>
                            {mtMessage}
                        </p>
                        <div style={{ padding: '1rem 1.5rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-block' }}>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                Estimated Restoration: <strong style={{ color: 'var(--warning)', marginLeft: '0.5rem' }}>{mtResolution}</strong>
                            </p>
                        </div>
                        <button onClick={() => window.location.reload()} className="btn btn-ghost" style={{ marginTop: '2rem' }}>↻ Try Again</button>
                    </div>
                </div>
            )}
            <div style={{ width: '100%', maxWidth: 420 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div className="login-logo">
                        <div className="brand-logo-container" style={{ width: '64px', height: '64px', margin: '0 auto 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            <img src={logo} className="logo-img" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                        <h1 style={{ margin: 0, lineHeight: 1.1 }}>
                            <span style={{ fontSize: '1.75rem', display: 'block', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                                {features.brand_login_title || 'LIFE-LONG UNITY'}
                            </span>
                            <span style={{ fontSize: '1.25rem', display: 'block', fontWeight: 500, color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                                Member <br/> Portal
                            </span>
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>{features.brand_login_tagline || 'Financial stability for every member'}</p>
                </div>

                <div className="card">
                    {view === 'login' && (
                        <>
                            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 700 }}>🔐 Member Sign In</h2>
                            {err && <div className="toast toast-error" style={{ marginBottom: '1rem' }}>{err}</div>}
                            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

                            <form onSubmit={submit}>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>Phone Number <span className="required">*</span></label>
                                    <input id="member-phone" type="tel" name="phone" value={form.phone} onChange={h} required
                                        placeholder="254712345678" autoComplete="tel" />
                                </div>
                                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                                    <label>Password / PIN <span className="required">*</span></label>
                                    <div className="password-input-wrapper">
                                        <input id="member-pin" type={showPin ? 'text' : 'password'} name="pin" value={form.pin} onChange={h} required
                                            placeholder="••••••••" autoComplete="off" />
                                        <button
                                            type="button"
                                            className="password-toggle-btn"
                                            onClick={() => setShowPin(!showPin)}
                                            title={showPin ? 'Hide PIN' : 'Show PIN'}
                                        >
                                            {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
                                    <button type="button" onClick={() => { setView('forgot'); setErr(''); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                                        Forgot Password?
                                    </button>
                                </div>
                                <button id="member-login-btn" type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '0.75rem' }}>
                                    {busy ? 'Signing in…' : 'Sign In →'}
                                </button>
                            </form>
                        </>
                    )}

                    {view === 'forgot' && (
                        <>
                            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 700 }}>🛡️ Reset Password</h2>
                            {err && <div className="toast toast-error" style={{ marginBottom: '1rem' }}>{err}</div>}
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                Enter your phone number. We will send you a 6-digit security code to verify your identity.
                            </p>
                            <form onSubmit={handleForgotRequest}>
                                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                                    <label>{deliveryMethod === 'email' ? 'Email Address' : 'Phone Number'}</label>
                                    <input 
                                        type={deliveryMethod === 'email' ? 'email' : 'tel'} 
                                        value={forgotPhone} 
                                        onChange={e => setForgotPhone(e.target.value)} 
                                        required
                                        placeholder={deliveryMethod === 'email' ? 'member@example.com' : '254712345678'} 
                                    />
                                </div>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>Delivery Method</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <button type="button" onClick={() => setDeliveryMethod('sms')} className={`btn ${deliveryMethod === 'sms' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.8rem', padding: '0.5rem' }}>
                                            <Smartphone size={14} style={{ marginRight: '0.4rem' }} /> SMS
                                        </button>
                                        <button type="button" onClick={() => setDeliveryMethod('email')} className={`btn ${deliveryMethod === 'email' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.8rem', padding: '0.5rem' }}>
                                            <Mail size={14} style={{ marginRight: '0.4rem' }} /> Email
                                        </button>
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '0.75rem' }}>
                                    {busy ? 'Sending...' : 'Send Verification Code →'}
                                </button>
                                <button type="button" onClick={() => setView('login')} className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.8rem' }}>
                                    Cancel
                                </button>
                            </form>
                        </>
                    )}

                    {view === 'reset' && (
                        <>
                            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 700 }}>✅ Verify & Reset</h2>
                            {err && <div className="toast toast-error" style={{ marginBottom: '1rem' }}>{err}</div>}
                            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}
                            <form onSubmit={handleResetSubmit}>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>6-Digit Code</label>
                                    <input type="text" name="otp" maxLength={6} value={resetForm.otp} onChange={hr} required
                                        placeholder="000000" style={{ textAlign: 'center', letterSpacing: '0.5rem', fontWeight: 700 }} />
                                </div>
                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                    <label>New Password</label>
                                    <div className="password-input-wrapper">
                                        <input type={showNewPin ? 'text' : 'password'} name="newPin" value={resetForm.newPin} onChange={hr} required
                                            placeholder="8+ characters" />
                                        <button
                                            type="button"
                                            className="password-toggle-btn"
                                            onClick={() => setShowNewPin(!showNewPin)}
                                            title={showNewPin ? 'Hide' : 'Show'}
                                        >
                                            {showNewPin ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label>Confirm Password</label>
                                    <div className="password-input-wrapper">
                                        <input type={showConfirmPin ? 'text' : 'password'} name="confirmPin" value={resetForm.confirmPin} onChange={hr} required
                                            placeholder="Repeat new password" />
                                        <button
                                            type="button"
                                            className="password-toggle-btn"
                                            onClick={() => setShowConfirmPin(!showConfirmPin)}
                                            title={showConfirmPin ? 'Hide' : 'Show'}
                                        >
                                            {showConfirmPin ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '0.75rem' }}>
                                    {busy ? 'Resetting...' : 'Update Password & Login'}
                                </button>
                                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                                    <button type="button" onClick={() => setView('forgot')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.75rem', cursor: 'pointer' }}>
                                        Didn't get a code? Try again
                                    </button>
                                </div>
                            </form>
                        </>
                    )}

                    {view === '2fa' && (
                        <>
                            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 700 }}>🛡️ Two-Factor Verification</h2>
                            {err && <div className="toast toast-error" style={{ marginBottom: '1rem' }}>{err}</div>}
                             <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center' }}>
                                Your account is protected with 2FA.<br/>
                                Code sent to your {twoFAMethod === 'totp' ? 'Authenticator App' : twoFAMethod.toUpperCase()}.
                            </p>
                            <form onSubmit={handle2FAVerify}>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ textAlign: 'center', display: 'block' }}>Verification Code</label>
                                    <input type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} required
                                        placeholder="000000" style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem', fontWeight: 700 }} />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '0.75rem' }}>
                                    {busy ? 'Verifying...' : 'Verify & Sign In →'}
                                </button>
                                
                                {twoFAMethod !== 'totp' && (
                                    <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>Didn't get the code?</p>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                            <button type="button" onClick={() => handleResendOTP('sms')} disabled={busy} className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }}>Resend SMS</button>
                                            <button type="button" onClick={() => handleResendOTP('email')} disabled={busy} className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }}>Resend Email</button>
                                        </div>
                                    </div>
                                )}

                                <button type="button" onClick={() => { setView('login'); setOtp(''); }} className="btn btn-ghost" style={{ width: '100%', marginTop: '1rem', fontSize: '0.8rem' }}>
                                    Back to Login
                                </button>
                            </form>
                        </>
                    )}

                    <div style={{ marginTop: '1.5rem', padding: '0.75rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        Admin?{' '}
                        <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>
                            Go to Admin Login →
                        </a>
                    </div>
                </div>


            </div>
        </div>
    );
};

export default MemberLogin;
