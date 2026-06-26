import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, ShieldCheck, AlertTriangle, RefreshCw, ArrowRight, CheckCircle2 } from 'lucide-react';
import { apiFetch, memberFetch } from '../utils/api';

const ChangePassword = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Determine if we are in member portal context
    const isMember = location.pathname.includes('/member');
    const [form, setForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const mustChange = localStorage.getItem(isMember ? 'member_must_change_password' : 'mustChangePassword') === 'true';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (form.newPassword !== form.confirmPassword) {
            return setError('Passwords do not match.');
        }

        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passRegex.test(form.newPassword)) {
            return setError('Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.');
        }

        setBusy(true);
        try {
            const endpoint = isMember ? '/api/member/change-pin' : '/api/auth/change-password';
            const fetcher = isMember ? memberFetch : apiFetch;
            
            const r = await fetcher(endpoint, {
                method: 'POST',
                body: JSON.stringify({
                    ...(isMember ? {
                        currentPin: form.currentPassword,
                        newPin: form.newPassword
                    } : {
                        currentPassword: form.currentPassword,
                        newPassword: form.newPassword
                    }),
                    isMandatoryReset: mustChange
                })
            });

            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to update password');

            setSuccess(true);
            // Clear the flag
            localStorage.removeItem(isMember ? 'member_must_change_password' : 'mustChangePassword');
            
            setTimeout(() => {
                navigate(isMember ? '/member/portal/overview' : '/');
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ 
            minHeight: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'var(--bg-primary)',
            padding: '2rem'
        }}>
            <div className="card shadow-lg" style={{ maxWidth: 450, width: '100%', padding: '2.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ 
                        width: 64, height: 64, 
                        background: 'var(--accent-dim)', 
                        color: 'var(--accent)', 
                        borderRadius: 16, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        margin: '0 auto 1rem' 
                    }}>
                        {success ? <CheckCircle2 size={32} /> : <Lock size={32} />}
                    </div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0 }}>
                        {success ? (isMember ? 'PIN Updated' : 'Security Updated') : (isMember ? 'Update Your PIN' : 'Update Your Security')}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        {mustChange 
                            ? 'A password change is required for your account security.' 
                            : 'Update your login credentials to stay protected.'}
                    </p>
                </div>

                {success ? (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <div className="toast toast-success" style={{ marginBottom: '1.5rem' }}>
                            {isMember ? 'PIN updated successfully!' : 'Password updated successfully!'} Redirecting...
                        </div>
                        <RefreshCw className="spin text-accent" size={24} />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {error && (
                            <div className="toast toast-error" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <AlertTriangle size={18} /> {error}
                            </div>
                        )}

                        {(isMember || !mustChange) && (
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                    Current {isMember ? 'PIN' : 'Password'} <span style={{ color: 'var(--danger)' }}>*</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input 
                                        type="password" 
                                        className="input" 
                                        style={{ width: '100%', paddingLeft: '2.75rem' }} 
                                        value={form.currentPassword}
                                        onChange={e => setForm({...form, currentPassword: e.target.value})}
                                        placeholder={isMember ? "Enter your current PIN" : "Enter current password"}
                                        required
                                    />
                                    <ShieldCheck size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                </div>
                            </div>
                        )}

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                New {isMember ? 'PIN / Password' : 'Password'}
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="password" 
                                    className="input" 
                                    style={{ width: '100%', paddingLeft: '2.75rem' }} 
                                    value={form.newPassword}
                                    onChange={e => setForm({...form, newPassword: e.target.value})}
                                    placeholder={isMember ? "8+ chars, e.g. Sacco@2024" : "Enter new password"}
                                    required
                                />
                                <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                            <label style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                Confirm {isMember ? 'PIN / Password' : 'Password'}
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="password" 
                                    className="input" 
                                    style={{ width: '100%', paddingLeft: '2.75rem' }} 
                                    value={form.confirmPassword}
                                    onChange={e => setForm({...form, confirmPassword: e.target.value})}
                                    placeholder="Re-type to confirm"
                                    required
                                />
                                <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            disabled={busy}
                            style={{ padding: '1rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
                        >
                            {busy ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />}
                            Update Credentials
                        </button>

                        <button 
                            type="button" 
                            className="btn btn-ghost" 
                            onClick={() => navigate(-1)}
                            style={{ fontSize: '0.85rem' }}
                        >
                            Skip for now
                        </button>
                    </form>
                )}

                <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: 12, display: 'flex', gap: '1rem' }}>
                    <div style={{ color: 'var(--accent)' }}><ShieldCheck size={20} /></div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                        <strong>Pro Tip:</strong> Use a combination of letters, numbers, and symbols to create a stronger password.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChangePassword;
