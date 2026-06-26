import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ChevronLeft, Home } from 'lucide-react';

const Forbidden = () => {
    const navigate = useNavigate();

    return (
        <div style={{ 
            height: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            padding: '2rem',
            textAlign: 'center'
        }}>
            <div style={{ maxWidth: '500px' }}>
                <div style={{ 
                    width: '80px', 
                    height: '80px', 
                    background: 'var(--danger-dim)', 
                    color: 'var(--danger)', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    margin: '0 auto 2rem'
                }}>
                    <ShieldAlert size={40} />
                </div>
                
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 1rem' }}>Access Denied</h1>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2.5rem' }}>
                    You do not have the required permissions to view this section. 
                    If you believe this is an error, please contact the system administrator.
                </p>
                
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ padding: '0.75rem 1.5rem' }}>
                        <ChevronLeft size={18} /> Go Back
                    </button>
                    <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
                        <Home size={18} /> Home Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Forbidden;
