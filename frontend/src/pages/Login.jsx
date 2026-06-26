import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Phone, Mail } from 'lucide-react';
import { setToken, setUsername, setRole, setAdminId } from '../utils/api';
import logo from '../assets/logo.png';

const Login = () => {
    const [form, setForm]     = useState({ username: 'admin', password: '' });
    const [error, setError]   = useState('');
    const [loading, setLoading] = useState(false);
    const [view, setView]       = useState('login'); // 'login', '2fa', 'forgot', 'reset'
    const [adminId, setPendingAdminId] = useState(null);
    const [otp, setOtp]         = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [resetForm, setResetForm] = useState({ newPassword: '', confirmPassword: '' });
    const [deliveryMethod, setDeliveryMethod] = useState('email');
    const [features, setFeatures] = useState({});
    const navigate              = useNavigate();

    useEffect(() => {
        document.title = "Admin Portal | LIFE-LONG UNITY";
        fetch('/api/system/status')
            .then(r => r.json())
            .then(data => {
                if (data.features) {
                    setFeatures(data.features);
                }
            })
            .catch(() => {});
    }, []);

    const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const safeJson = async (res) => { try { return await res.json(); } catch { return {}; } };

    const submitCredentials = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const res  = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data.error || 'Login failed');
            
            if (data.requires2FA) {
                setView('2fa');
                setPendingAdminId(data.adminId);
                setLoading(false);
                return;
            }

            setToken(data.token);
            setUsername(data.username);
            setRole(data.role || 'admin');
            setAdminId(data.id);
            if (data.mustChangePassword) localStorage.setItem('mustChangePassword', 'true');
            else localStorage.removeItem('mustChangePassword');
            
            if (data.role === 'ict_admin') navigate('/system-control');
            else navigate('/');
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const submit2FA = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const res = await fetch('/api/auth/login/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, token: otp })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data.error || '2FA Verification failed');
            
            setToken(data.token);
            setUsername(data.username);
            setRole(data.role || 'admin');
            setAdminId(data.id);
            if (data.mustChangePassword) localStorage.setItem('mustChangePassword', 'true');
            else localStorage.removeItem('mustChangePassword');
            
            if (data.role === 'ict_admin') navigate('/system-control');
            else navigate('/');
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleForgotRequest = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: form.username, method: deliveryMethod })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data.error || 'Request failed');
            setError('');
            alert(data.message);
            setView('reset');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault();
        if (resetForm.newPassword !== resetForm.confirmPassword) return setError('Passwords do not match.');
        
        setError(''); setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: form.username, 
                    otp, 
                    newPassword: resetForm.newPassword 
                })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data.error || 'Reset failed');
            alert(data.message);
            setView('login');
            setOtp('');
            setResetForm({ newPassword: '', confirmPassword: '' });
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const resendOTP = async (method) => {
        setError(''); setLoading(true);
        try {
            const res = await fetch('/api/auth/2fa/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, method })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data.error || 'Request failed');
            alert(data.message);
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header-section" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div className="login-logo-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                        <div className="login-logo-disk" style={{ width: '80px', height: '80px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={logo} className="logo-img" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                    </div>
                    <h1 style={{ margin: 0, lineHeight: 1.1 }}>
                        <span style={{ fontSize: '1.75rem', display: 'block', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                            {features.organization_name || 'LIFE-LONG UNITY'}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '0.8rem' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Admin
                            </span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Portal
                            </span>
                        </div>
                    </h1>
                    <p className="login-sub" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {view === '2fa' ? 'Enter security token' : 
                         view === 'forgot' ? 'Account Recovery' :
                         view === 'reset' ? 'Set New Password' : 
                         (features.brand_login_tagline || 'Authorized access only')}
                    </p>
                </div>

                {error && <div className="toast toast-error">{error}</div>}

                {view === 'login' && (
                    <form onSubmit={submitCredentials}>
                        <div className="form-group">
                            <label>Username</label>
                            <input
                                name="username"
                                value={form.username}
                                onChange={handle}
                                autoComplete="username"
                                required
                                placeholder="Enter username"
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={form.password}
                                    onChange={handle}
                                    autoComplete="current-password"
                                    placeholder="Enter password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', marginBottom: '1.5rem' }}>
                            <button type="button" onClick={() => setView('forgot')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                                Forgot Password?
                            </button>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Authenticating…' : 'Sign In'}
                        </button>
                    </form>
                )}

                {view === 'forgot' && (
                    <form onSubmit={handleForgotRequest}>
                        <div className="form-group">
                            <label>Admin Username</label>
                            <input
                                name="username"
                                value={form.username}
                                onChange={handle}
                                required
                                placeholder="Enter your username"
                            />
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>Delivery Method</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <button type="button" onClick={() => setDeliveryMethod('sms')} className={`btn ${deliveryMethod === 'sms' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.8rem', padding: '0.5rem' }}>
                                    <Phone size={14} style={{ marginRight: '0.4rem' }} /> SMS
                                </button>
                                <button type="button" onClick={() => setDeliveryMethod('email')} className={`btn ${deliveryMethod === 'email' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.8rem', padding: '0.5rem' }}>
                                    <Mail size={14} style={{ marginRight: '0.4rem' }} /> Email
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Sending...' : 'Send Reset Code'}
                        </button>
                        <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem' }} onClick={() => setView('login')}>
                            Back to Login
                        </button>
                    </form>
                )}

                {view === 'reset' && (
                    <form onSubmit={handleResetSubmit}>
                        <div className="form-group">
                            <label>Verification Code</label>
                            <input
                                type="text"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g,''))}
                                placeholder="000 000"
                                required
                                maxLength="6"
                                style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.3rem' }}
                            />
                        </div>
                        <div className="form-group">
                            <label>New Password</label>
                            <input
                                type="password"
                                value={resetForm.newPassword}
                                onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                                required
                                placeholder="Min 8 characters"
                            />
                        </div>
                        <div className="form-group">
                            <label>Confirm New Password</label>
                            <input
                                type="password"
                                value={resetForm.confirmPassword}
                                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                                required
                                placeholder="Repeat password"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                            {loading ? 'Updating...' : 'Reset Password'}
                        </button>
                    </form>
                )}

                {view === '2fa' && (
                    <form onSubmit={submit2FA}>
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', textAlign: 'center', marginBottom: '1rem' }}>Verification Code</label>
                            <input
                                type="text"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g,''))}
                                placeholder="000 000"
                                required
                                maxLength="6"
                                style={{ textAlign: 'center', fontSize: '1.75rem', letterSpacing: '0.5rem', fontWeight: 800, background: 'var(--surface-2)' }}
                                autoFocus
                            />
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Didn't receive the code?</p>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                <button type="button" onClick={() => resendOTP('sms')} disabled={loading} className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Phone size={12} /> Resend SMS
                                </button>
                                <button type="button" onClick={() => resendOTP('email')} disabled={loading} className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Mail size={12} /> Resend Email
                                </button>
                            </div>
                        </div>

                        <button 
                            type="button" 
                            className="btn btn-ghost" 
                            style={{ width: '100%', marginTop: '1rem' }} 
                            onClick={() => setView('login')}
                        >
                            Back to Credentials
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Login;
