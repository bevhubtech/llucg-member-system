import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldAlert, User, Calendar, Award, ArrowLeft, RefreshCw } from 'lucide-react';
import { apiFetch } from '../utils/api';
import logo from '../assets/logo.png';

const VerificationPage = () => {
    const { membershipNumber } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [member, setMember] = useState(null);
    const [error, setError] = useState(null);

    const load = () => {
        setLoading(true);
        setError(null);
        // Using standard fetch instead of apiFetch to ensure NO REDIRECT to login occurs
        // and that no Authorization header is sent for this public endpoint.
        fetch(`/api/v/verify/${membershipNumber}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error);
                setMember(d.member);
                setLoading(false);
            })
            .catch(e => {
                setError(e.message || 'Verification Error');
                setLoading(false);
            });
    };

    useEffect(() => { load(); }, [membershipNumber]);

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <img src={logo} alt="Logo" style={{ width: 60, height: 60, borderRadius: 99, marginBottom: '0.75rem', border: '2px solid #fbbf24' }} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.05em', color: '#fbbf24' }}>LLUCG IDENTITY</h2>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.25rem' }}>Secured Verification Portal</div>
            </div>

            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div 
                        key="loading"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', marginTop: '4rem' }}>
                        <RefreshCw className="animate-spin" size={32} color="#fbbf24" />
                    </motion.div>
                ) : error ? (
                    <motion.div 
                        key="error"
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        style={{ textAlign: 'center', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', padding: '2rem', borderRadius: 16, maxWidth: 400 }}>
                        <ShieldAlert size={64} color="#ef4444" style={{ margin: '0 auto 1.25rem' }} />
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Verification Failed</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{error}</p>
                        <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={() => navigate('/')}>Return to Home</button>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="success"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        style={{ width: '100%', maxWidth: 400 }}>
                        
                        {/* Identity Card UI */}
                        <div style={{ background: '#1e293b', borderRadius: 24, padding: '2rem', border: '1px solid rgba(251,191,36,0.2)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }}>
                            {/* Status Ribbon */}
                            <div style={{ 
                                position: 'absolute', top: 20, right: -35, background: member?.status === 'active' ? '#16a34a' : '#dc2626', 
                                color: 'white', padding: '5px 40px', transform: 'rotate(45deg)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                                {member?.status}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {/* Photo Placeholder - Rounded Square */}
                                <div style={{ width: 100, height: 100, borderRadius: 12, background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #1e293b', boxShadow: '0 0 0 2px #fbbf24', marginBottom: '1.25rem' }}>
                                    <User size={48} color="#94a3b8" />
                                </div>

                                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, textAlign: 'center', marginBottom: '0.25rem' }}>{member?.name}</h3>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.05em' }}>{member?.membershipNumber}</div>
                            </div>

                            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(15,23,42,0.4)', padding: '0.75rem 1rem', borderRadius: 12 }}>
                                    <ShieldCheck size={18} color="#16a34a" />
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Verification Status</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{member.status === 'active' ? '✓ Verified Active Agent' : '⚠️ Suspension / Inactive'}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(15,23,42,0.4)', padding: '0.75rem 1rem', borderRadius: 12 }}>
                                    <Calendar size={18} color="#fbbf24" />
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Membership Since</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmtDate(member.joinDate)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                                Secure identity generated on {fmtDate(new Date())}.<br/>
                                This pass is official property of LIFE-LONG UNITY CAPITAL GROUP.
                            </p>
                            <button className="btn btn-ghost" style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8' }} onClick={() => navigate('/')}>
                                <ArrowLeft size={16} /> Back to Portal
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VerificationPage;
