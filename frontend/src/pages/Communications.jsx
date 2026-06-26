import { useState, useEffect, useRef, useCallback } from 'react';
import { 
    MessageSquare, Send, CheckCircle, Clock, Search, 
    MessageCircle, Shield, XCircle, SendHorizontal, Paperclip, Download, Eye, Hash, Lock
} from 'lucide-react';
import { apiFetch, memberFetch, getRole, getUsername, getMemberName, getMemberToken, getToken, viewBlob } from '../utils/api';
import GroupChannels from '../components/GroupChannels';
import AdminDirectMessages from '../components/AdminDirectMessages';

const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const Communications = () => {
    const [activeTab, setActiveTab] = useState('support'); // 'support' | 'admin'
    const [threads, setThreads] = useState([]);
    const [activeThread, setActiveThread] = useState(null);
    const [messages, setMessages] = useState([]);
    const [adminChat, setAdminChat] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msgInput, setMsgInput] = useState('');
    const [msgFile, setMsgFile] = useState(null);
    const [adminInput, setAdminInput] = useState('');
    const [adminFile, setAdminFile] = useState(null);
    const [search, setSearch] = useState('');
    const [memberDetails, setMemberDetails] = useState(null);
    const [ticketModal, setTicketModal] = useState(false);
    const [ticketForm, setTicketForm] = useState({ subject: '', message: '', category: 'general' });
    const [creating, setCreating] = useState(false);
    const chatEndRef = useRef(null);
    const adminEndRef = useRef(null);
    
    const role = getRole();
    const isMember = !!getMemberToken();
    const fetcher = isMember ? memberFetch : apiFetch;
    const userName = isMember ? getMemberName() : getUsername();

    const scrollToBottom = (ref) => {
        ref.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchThreads = useCallback(async () => {
        try {
            const res = await fetcher(`/api/comm/threads?role=${role || 'member'}`);
            const data = await res.json();
            setThreads(data.threads || []);
        } catch (err) { console.error('Threads fetch error:', err); }
    }, [fetcher, role]);

    const fetchMessages = useCallback(async (threadId) => {
        try {
            const res = await fetcher(`/api/comm/threads/${threadId}/messages`);
            const data = await res.json();
            setMessages(data.messages || []);
        } catch (err) { console.error('Messages fetch error:', err); }
    }, [fetcher]);

    useEffect(() => {
        if (isMember) {
            memberFetch('/api/member/me').then(r => r.json()).then(d => setMemberDetails(d));
        }
    }, [isMember]);

    const fetchAdminChat = useCallback(async () => {
        try {
            const res = await apiFetch('/api/comm/admin-chat');
            const data = await res.json();
            setAdminChat(data.messages || []);
        } catch (err) { console.error('Admin chat fetch error:', err); }
    }, []);

    useEffect(() => {
        if (activeTab === 'support') {
            fetchThreads();
            const id = setInterval(fetchThreads, 10000);
            return () => clearInterval(id);
        } else {
            fetchAdminChat();
            const id = setInterval(fetchAdminChat, 5000);
            return () => clearInterval(id);
        }
    }, [activeTab, fetchThreads, fetchAdminChat]);

    useEffect(() => {
        if (activeThread) {
            fetchMessages(activeThread.id);
            const id = setInterval(() => fetchMessages(activeThread.id), 5000);
            return () => clearInterval(id);
        }
    }, [activeThread, fetchMessages]);

    useEffect(() => {
        scrollToBottom(chatEndRef);
    }, [messages]);

    useEffect(() => {
        scrollToBottom(adminEndRef);
    }, [adminChat]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!msgInput.trim() && !msgFile) || !activeThread) return;
        
        const form = new FormData();
        form.append('content', msgInput);
        if (msgFile) form.append('attachment', msgFile);

        try {
            await fetcher(`/api/comm/threads/${activeThread.id}/messages`, {
                method: 'POST',
                body: form
            });
            setMsgInput('');
            setMsgFile(null);
            fetchMessages(activeThread.id);
        } catch (err) { alert(err.message); }
    };

    const handleSendAdminChat = async (e) => {
        e.preventDefault();
        if (!adminInput.trim() && !adminFile) return;
        
        const form = new FormData();
        form.append('content', adminInput);
        if (adminFile) form.append('attachment', adminFile);

        try {
            await fetcher('/api/comm/admin-chat', {
                method: 'POST',
                body: form
            });
            setAdminInput('');
            setAdminFile(null);
            fetchAdminChat();
        } catch (err) { alert(err.message); }
    };

    const renderAttachment = (url) => {
        if (!url) return null;
        const secureUrl = `${url}?token=${getToken()}`;
        const isImage = url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
        
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {isImage && (
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <img src={secureUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: 200, display: 'block' }} />
                    </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                        onClick={() => viewBlob(url)}
                        className="btn btn-ghost" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: 'rgba(99,102,241,0.1)', borderRadius: 6, color: 'var(--accent)', fontSize: '0.75rem', border: '1px solid rgba(99,102,241,0.2)' }}
                    >
                        <Eye size={14} /> View
                    </button>
                    <a 
                        href={secureUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', background: 'rgba(0,0,0,0.05)', borderRadius: 6, textDecoration: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', border: '1px solid var(--border)' }}
                    >
                        <Download size={14} /> Download
                    </a>
                </div>
            </div>
        );
    };

    const handleCloseThread = async (id) => {
        try {
            await fetcher(`/api/comm/threads/${id}/close`, { method: 'POST' });
            fetchThreads();
            if (activeThread?.id === id) {
                setActiveThread(prev => ({ ...prev, status: 'closed' }));
            }
        } catch (err) { alert(err.message); }
    };

    const filteredThreads = threads.filter(t => 
        t.subject.toLowerCase().includes(search.toLowerCase()) || 
        (t.memberName && t.memberName.toLowerCase().includes(search.toLowerCase()))
    );

    const handleCreateThread = async (e) => {
        e.preventDefault();
        if (!ticketForm.subject.trim() || !ticketForm.message.trim()) return;
        setCreating(true);
        try {
            const res = await fetcher('/api/comm/threads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: ticketForm.subject,
                    initialMessage: ticketForm.message,
                    category: ticketForm.category
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            setTicketModal(false);
            setTicketForm({ subject: '', message: '', category: 'general' });
            fetchThreads();
        } catch (err) { alert(err.message); }
        setCreating(false);
    };

    return (
        <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="section-header" style={{ marginBottom: 0 }}>
                <div>
                    <h2>Communication Hub</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Support members and coordinate with staff</p>
                </div>
                <div style={{ display: 'flex', background: 'var(--glass)', padding: '0.25rem', borderRadius: 10, gap: '0.25rem' }}>
                    <button 
                        className={`btn ${activeTab === 'support' ? 'btn-primary' : 'btn-ghost'}`} 
                        onClick={() => setActiveTab('support')}
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                    >
                        <MessageSquare size={14} style={{ marginRight: 6 }} /> Member Support
                    </button>
                    <button 
                        className={`btn ${activeTab === 'channels' ? 'btn-primary' : 'btn-ghost'}`} 
                        onClick={() => setActiveTab('channels')}
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                    >
                        <Hash size={14} style={{ marginRight: 6 }} /> Channels
                    </button>
                    <button 
                        className={`btn ${activeTab === 'dms' ? 'btn-primary' : 'btn-ghost'}`} 
                        onClick={() => setActiveTab('dms')}
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                    >
                        <Lock size={14} style={{ marginRight: 6 }} /> Encrypted DMs
                    </button>
                    {!isMember && (
                        <button 
                            className={`btn ${activeTab === 'admin' ? 'btn-primary' : 'btn-ghost'}`} 
                            onClick={() => setActiveTab('admin')}
                            style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                        >
                            <Shield size={14} style={{ marginRight: 6 }} /> Admin Staff Room
                        </button>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', gap: '1.25rem', overflow: 'hidden' }}>
                {activeTab === 'support' ? (
                    <>
                        {/* Threads Sidebar */}
                        <div className="card shadow-sm" style={{ width: 320, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                                    <input 
                                        type="text" 
                                        className="input" 
                                        placeholder="Search tickets..." 
                                        style={{ paddingLeft: 30, fontSize: '0.8rem', height: 36 }}
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            {isMember && (
                                <button className="btn btn-primary" style={{ width: '100%', fontSize: '0.8rem' }} onClick={() => setTicketModal(true)}>
                                    + Start New Ticket
                                </button>
                            )}
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {filteredThreads.map(t => (
                                    <div 
                                        key={t.id} 
                                        className={`card ${activeThread?.id === t.id ? 'active' : ''}`}
                                        style={{ 
                                            padding: '0.75rem', 
                                            cursor: 'pointer', 
                                            background: activeThread?.id === t.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                                            border: activeThread?.id === t.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                                            borderRadius: 8
                                        }}
                                        onClick={() => setActiveThread(t)}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>#{t.id} • {t.memberName}</span>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <span style={{ 
                                                    fontSize: '0.6rem', 
                                                    padding: '0.1rem 0.4rem', 
                                                    borderRadius: 4, 
                                                    background: t.category === 'finance' ? 'rgba(245,158,11,0.15)' : t.category === 'technical' ? 'rgba(99,102,241,0.15)' : t.category === 'secretary' ? 'rgba(236,72,153,0.15)' : 'rgba(100,116,139,0.1)',
                                                    color: t.category === 'finance' ? '#f59e0b' : t.category === 'technical' ? '#6366f1' : t.category === 'secretary' ? '#ec4899' : '#64748b',
                                                    fontWeight: 700
                                                }}>{(t.category || 'general').toUpperCase()}</span>
                                                <span style={{ 
                                                    fontSize: '0.6rem', 
                                                    padding: '0.1rem 0.4rem', 
                                                    borderRadius: 4, 
                                                    background: t.status === 'open' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                                                    color: t.status === 'open' ? '#22c55e' : '#64748b'
                                                }}>{t.status.toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {t.subject}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                                            {fmtTime(t.updated_at)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Chat Interface */}
                        <div className="card shadow-sm" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
                            {activeThread ? (
                                <>
                                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1rem' }}>{activeThread.subject}</h3>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Conversation with {activeThread.memberName}</p>
                                        </div>
                                        {activeThread.status === 'open' && (
                                            <button className="btn btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => handleCloseThread(activeThread.id)}>
                                                <XCircle size={14} style={{ marginRight: 6 }} /> Resolve Ticket
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {messages.map(m => (
                                            <div key={m.id} style={{ alignSelf: m.senderType === 'admin' ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                                                <div style={{ 
                                                    padding: '0.75rem 1rem', 
                                                    borderRadius: 14, 
                                                    background: m.senderType === 'admin' ? 'var(--accent)' : 'var(--bg-body)',
                                                    color: m.senderType === 'admin' ? '#fff' : 'var(--text-primary)',
                                                    fontSize: '0.85rem',
                                                    boxShadow: 'var(--shadow-sm)',
                                                    border: m.senderType === 'admin' ? 'none' : '1px solid var(--border)'
                                                }}>
                                                    {m.content && <div>{m.content}</div>}
                                                    {renderAttachment(m.attachmentUrl)}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.25rem', textAlign: m.senderType === 'admin' ? 'right' : 'left', padding: '0 0.5rem' }}>
                                                    {m.senderName} • {fmtTime(m.timestamp)}
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatEndRef} />
                                    </div>
                                    {activeThread.status === 'open' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-body)', borderTop: '1px solid var(--border)' }}>
                                            {msgFile && (
                                                <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>📎 {msgFile.name}</span>
                                                    <button className="btn btn-ghost" style={{ padding: '0.2rem', color: 'var(--danger)' }} onClick={() => setMsgFile(null)}>
                                                        <XCircle size={14} />
                                                    </button>
                                                </div>
                                            )}
                                            <form onSubmit={handleSendMessage} style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                                <label className="btn btn-ghost btn-icon" style={{ cursor: 'pointer' }}>
                                                    <input type="file" style={{ display: 'none' }} onChange={e => setMsgFile(e.target.files[0])} />
                                                    <Paperclip size={18} />
                                                </label>
                                                <input 
                                                    className="input" 
                                                    placeholder="Type your reply..." 
                                                    style={{ height: 42, background: 'var(--bg-card)', flex: 1 }}
                                                    value={msgInput}
                                                    onChange={e => setMsgInput(e.target.value)}
                                                />
                                                <button type="submit" className="btn btn-primary btn-icon" style={{ width: 42, height: 42 }}>
                                                    <Send size={18} />
                                                </button>
                                            </form>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--bg-body)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                            This ticket has been resolved and closed.
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: 'var(--text-dim)' }}>
                                    <MessageCircle size={48} opacity={0.2} />
                                    <p>Select a ticket from the sidebar to start responding</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : activeTab === 'admin' ? (
                    /* Admin Staff Chat */
                    <div className="card shadow-sm" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Shield size={20} color="var(--accent)" />
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>Admin Staff Room</h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)' }}>Private internal communication area for all staff</p>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {adminChat.map(m => (
                                <div key={m.id} style={{ 
                                    padding: '0.75rem 1rem', 
                                    borderRadius: 12, 
                                    background: m.adminId === 1 ? 'rgba(99,102,241,0.05)' : 'var(--bg-body)',
                                    border: '1px solid var(--border)',
                                    alignSelf: 'stretch'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--accent)' }}>{m.senderName} <span style={{ fontWeight: 400, opacity: 0.7 }}>({m.senderRole})</span></span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{fmtTime(m.timestamp)}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                        {m.content && <div>{m.content}</div>}
                                        {renderAttachment(m.attachmentUrl)}
                                    </div>
                                </div>
                            ))}
                            <div ref={adminEndRef} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-body)', borderTop: '1px solid var(--border)' }}>
                            {adminFile && (
                                <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>📎 {adminFile.name}</span>
                                    <button className="btn btn-ghost" style={{ padding: '0.2rem', color: 'var(--danger)' }} onClick={() => setAdminFile(null)}>
                                        <XCircle size={14} />
                                    </button>
                                </div>
                            )}
                            <form onSubmit={handleSendAdminChat} style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <label className="btn btn-ghost btn-icon" style={{ cursor: 'pointer' }}>
                                    <input type="file" style={{ display: 'none' }} onChange={e => setAdminFile(e.target.files[0])} />
                                    <Paperclip size={18} />
                                </label>
                                <input 
                                    className="input" 
                                    placeholder="Post a message to staff room..." 
                                    style={{ height: 42, background: 'var(--bg-card)', flex: 1 }}
                                    value={adminInput}
                                    onChange={e => setAdminInput(e.target.value)}
                                />
                                <button type="submit" className="btn btn-primary" style={{ padding: '0 1.25rem' }}>
                                    <SendHorizontal size={18} />
                                </button>
                            </form>
                        </div>
                    </div>
                ) : activeTab === 'channels' ? (
                    <GroupChannels context={isMember ? 'member' : 'admin'} memberDetails={memberDetails} />
                ) : activeTab === 'dms' ? (
                    <AdminDirectMessages />
                ) : null}
            </div>

            {/* New Ticket Modal */}
            {ticketModal && (
                <div className="modal-overlay" onClick={() => setTicketModal(false)}>
                    <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Start New Support Ticket</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setTicketModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateThread}>
                            <div className="form-group">
                                <label>Subject <span className="required">*</span></label>
                                <input 
                                    className="input" 
                                    placeholder="Briefly describe the issue" 
                                    required
                                    value={ticketForm.subject}
                                    onChange={e => setTicketForm(f => ({ ...f, subject: e.target.value }))}
                                />
                            </div>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Category</label>
                                    <select 
                                        className="select"
                                        value={ticketForm.category}
                                        onChange={e => setTicketForm(f => ({ ...f, category: e.target.value }))}
                                    >
                                        <option value="general">General Inquiry</option>
                                        <option value="finance">Financial Matter</option>
                                        <option value="secretary">Administrative</option>
                                        <option value="technical">Technical Support</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: '0.5rem' }}>
                                <label>Initial Message <span className="required">*</span></label>
                                <textarea 
                                    className="textarea" 
                                    placeholder="Provide details about your request..." 
                                    rows={4}
                                    required
                                    value={ticketForm.message}
                                    onChange={e => setTicketForm(f => ({ ...f, message: e.target.value }))}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={creating}>
                                    {creating ? 'Creating...' : 'Submit Ticket'}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => setTicketModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Communications;
