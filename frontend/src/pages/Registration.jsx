import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Phone, Mail, IdCard, Calendar, CheckCircle, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import logo from '../assets/logo.png';

const Registration = () => {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        name: '', phone: '', email: '', idNumber: '', dob: ''
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const h = e => setForm({ ...form, [e.target.name]: e.target.value });

    const nextStep = () => {
        if (step === 1 && (!form.name || !form.phone)) return setErr('Please enter your name and phone number.');
        setErr('');
        setStep(s => s + 1);
    };

    const prevStep = () => {
        setErr('');
        setStep(s => s - 1);
    };

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        try {
            const r = await fetch('/api/member/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setSuccess(true);
        } catch (e) {
            setErr(e.message);
        } finally {
            setBusy(false);
        }
    };

    if (success) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
                <div className="card" style={{ maxWidth: 450, textAlign: 'center', padding: '3rem' }}>
                    <div style={{ background: 'var(--success-dim)', color: 'var(--success)', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                        <ShieldCheck size={40} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>Application Submitted!</h2>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2.5rem' }}>
                        Thank you for joining LLUCG SACCO. Your application has been received and is currently being reviewed by our vetting committee. 
                        You will receive an SMS confirmation once your account is activated.
                    </p>
                    <Link to="/member/login" className="btn btn-primary" style={{ width: '100%', padding: '0.9rem' }}>
                        Return to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
            <div style={{ width: '100%', maxWidth: 480 }}>
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <img src={logo} alt="Logo" style={{ width: 60, height: 60, marginBottom: '1rem' }} />
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Join LLUCG SACCO</h1>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Your journey to financial freedom starts here.</p>
                </div>

                <div className="card" style={{ padding: '2.5rem' }}>
                    {/* Progress Bar */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--border)', transition: 'all 0.3s' }}></div>
                        ))}
                    </div>

                    {err && <div className="badge badge-danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', borderRadius: 8 }}>{err}</div>}

                    <form onSubmit={submit}>
                        {step === 1 && (
                            <div className="form-step">
                                <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>1. Basic Information</h3>
                                <div className="form-group">
                                    <label>Full Name as per ID</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="text" name="name" value={form.name} onChange={h} placeholder="John Doe" style={{ paddingLeft: '2.5rem' }} />
                                        <User size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Phone Number</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="tel" name="phone" value={form.phone} onChange={h} placeholder="2547XXXXXXXX" style={{ paddingLeft: '2.5rem' }} />
                                        <Phone size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                    </div>
                                </div>
                                <button type="button" onClick={nextStep} className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}>
                                    Continue <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="form-step">
                                <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>2. Identity Details</h3>
                                <div className="form-group">
                                    <label>ID / Passport Number</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="text" name="idNumber" value={form.idNumber} onChange={h} placeholder="ID Number" style={{ paddingLeft: '2.5rem' }} />
                                        <IdCard size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Date of Birth</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="date" name="dob" value={form.dob} onChange={h} style={{ paddingLeft: '2.5rem' }} />
                                        <Calendar size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                    <button type="button" onClick={prevStep} className="btn btn-ghost" style={{ flex: 1 }}>
                                        <ArrowLeft size={18} />
                                    </button>
                                    <button type="button" onClick={nextStep} className="btn btn-primary" style={{ flex: 2 }}>
                                        Continue <ArrowRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="form-step">
                                <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>3. Professional Info</h3>
                                <div className="form-group">
                                    <label>Email Address</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="email" name="email" value={form.email} onChange={h} placeholder="you@example.com" style={{ paddingLeft: '2.5rem' }} />
                                        <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                                    </div>
                                </div>
                                <div style={{ background: 'var(--surface-2)', padding: '1rem', borderRadius: 12, border: '1px dashed var(--border)', textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                                        Note: We will ask for physical document uploads after initial vetting.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" onClick={prevStep} className="btn btn-ghost" style={{ flex: 1 }}>
                                        <ArrowLeft size={18} />
                                    </button>
                                    <button type="submit" disabled={busy} className="btn btn-primary" style={{ flex: 2 }}>
                                        {busy ? 'Submitting...' : 'Submit Application'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                        Already have an account? <Link to="/member/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign In here</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Registration;
