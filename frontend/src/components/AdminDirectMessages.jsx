import { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Users, Send, Shield, User, Lock, Search, MessageSquare, ShieldCheck
} from 'lucide-react';
import { apiFetch, getAdminId, getRoleLabel } from '../utils/api';

const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const AdminDirectMessages = () => {
    const [directory, setDirectory] = useState([]);
    const [activePartner, setActivePartner] = useState(null);
    const [messages, setMessages] = useState([]);
    const [msgInput, setMsgInput] = useState('');
    const [search, setSearch] = useState('');
    
    const chatEndRef = useRef(null);

    const fetchDirectory = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/comm/dms/directory`);
            const data = await res.json();
            setDirectory(data.users || []);
        } catch (err) { console.error('Directory fetch error:', err); }
    }, []);

    const fetchMessages = useCallback(async (partnerId) => {
        try {
            const res = await apiFetch(`/api/comm/dms/${partnerId}`);
            const data = await res.json();
            setMessages(data.messages || []);
            scrollToBottom();
        } catch (err) { console.error('DM error:', err); }
    }, []);

    useEffect(() => {
        fetchDirectory();
        const id = setInterval(fetchDirectory, 30000);
        return () => clearInterval(id);
    }, [fetchDirectory]);

    useEffect(() => {
        if (activePartner) {
            fetchMessages(activePartner.id);
            const id = setInterval(() => fetchMessages(activePartner.id), 5000);
            return () => clearInterval(id);
        }
    }, [activePartner, fetchMessages]);

    const scrollToBottom = () => {
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!msgInput.trim() || !activePartner) return;
        
        try {
            await apiFetch(`/api/comm/dms/${activePartner.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: msgInput })
            });
            setMsgInput('');
            fetchMessages(activePartner.id);
        } catch (err) { alert(err.message); }
    };

    const filteredDirectory = directory.filter(c => 
        c.username.toLowerCase().includes(search.toLowerCase()) || 
        c.role.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ flex: 1, display: 'flex', gap: '1.25rem', overflow: 'hidden', height: '100%' }}>
            {/* Sidebar Directory */}
            <div className="card shadow-sm" style={{ width: 320, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={16} className="text-dim" /> Admin Directory
                    </h3>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                        <input 
                            type="text" 
                            className="input" 
                            placeholder="Find a colleague..." 
                            style={{ paddingLeft: 30, fontSize: '0.8rem', height: 36 }}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {filteredDirectory.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '2rem 0' }}>No colleagues found.</div>
                    ) : (
                        filteredDirectory.map(admin => (
                            <div 
                                key={admin.id} 
                                onClick={() => setActivePartner(admin)}
                                style={{ 
                                    padding: '0.75rem', 
                                    cursor: 'pointer', 
                                    background: activePartner?.id === admin.id ? 'var(--accent-dim)' : 'transparent',
                                    border: activePartner?.id === admin.id ? '1px solid var(--accent)' : '1px solid transparent',
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ 
                                    width: 32, height: 32, borderRadius: '50%', 
                                    background: 'var(--bg-body)', display: 'flex', 
                                    alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' 
                                }}>
                                    {admin.role === 'superadmin' ? <ShieldCheck size={16} /> : <Shield size={16} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{admin.username}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{getRoleLabel(admin.role)}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Interface */}
            <div className="card shadow-sm" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
                {activePartner ? (
                    <>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-body)', borderRadius: '14px 14px 0 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ 
                                    width: 36, height: 36, borderRadius: '50%', 
                                    background: 'rgba(99,102,241,0.1)', display: 'flex', 
                                    alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' 
                                }}>
                                    {activePartner.role === 'superadmin' ? <ShieldCheck size={18} /> : <Shield size={18} />}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{activePartner.username}</h3>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                        <Lock size={10} style={{ marginRight: 2 }} /> AES-256-GCM Encrypted
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {messages.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                    <Lock size={48} opacity={0.2} style={{ marginBottom: '1rem' }} />
                                    <p>Secure Communication Channel</p>
                                    <p style={{ fontSize: '0.75rem', opacity: 0.6, maxWidth: 350, margin: '0 auto', lineHeight: '1.5' }}>
                                        This direct communication channel is secured with advanced AES-256-GCM encryption. All messages are encrypted at rest and strictly accessible only to the authenticated participants of this session.
                                    </p>
                                </div>
                            )}
                            {messages.map(m => {
                                const isMe = Number(m.senderId) === Number(getAdminId());
                                
                                return (
                                    <div key={m.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ 
                                            padding: '0.6rem 1rem', 
                                            borderRadius: isMe ? '14px 14px 0 14px' : '0 14px 14px 14px', 
                                            background: isMe ? 'var(--accent)' : 'var(--bg-body)',
                                            color: isMe ? '#fff' : 'var(--text-primary)',
                                            fontSize: '0.85rem',
                                            lineHeight: 1.5,
                                            boxShadow: isMe ? '0 2px 5px rgba(99,102,241,0.2)' : 'none',
                                            border: isMe ? 'none' : '1px solid var(--border)'
                                        }}>
                                            <div>{m.content}</div>
                                        </div>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.2rem', textAlign: isMe ? 'right' : 'left', padding: '0 0.5rem' }}>
                                            {fmtTime(m.timestamp)}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-body)', borderTop: '1px solid var(--border)', borderRadius: '0 0 14px 14px' }}>
                            <form onSubmit={handleSendMessage} style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <Lock size={16} color="var(--success)" opacity={0.7} title="E2EE Active" />
                                <input 
                                    className="input" 
                                    placeholder={`Secure message to ${activePartner.username}...`}
                                    style={{ height: 42, background: 'var(--bg-card)', flex: 1, borderRadius: 20, paddingLeft: '1.25rem' }}
                                    value={msgInput}
                                    onChange={e => setMsgInput(e.target.value)}
                                />
                                <button type="submit" className="btn btn-primary btn-icon" style={{ width: 42, height: 42, borderRadius: '50%' }}>
                                    <Send size={16} />
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: 'var(--text-dim)' }}>
                        <Lock size={48} opacity={0.15} />
                        <p>Select an administrator from the directory to start a secure session.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDirectMessages;
