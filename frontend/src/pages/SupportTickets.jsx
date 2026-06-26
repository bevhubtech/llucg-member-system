import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    MessageSquare, Send, CheckCircle2, Clock, Filter, 
    Search, User, Inbox, AlertCircle, ChevronRight, Hash, Paperclip, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, getToken } from '../utils/api';

const SupportTickets = () => {
    const [tickets, setTickets] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [replies, setReplies] = useState([]);
    const [newReply, setNewReply] = useState('');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('open');
    const [busy, setBusy] = useState(false);
    const [newFile, setNewFile] = useState(null);
    const chatEndRef = useRef(null);

    const fetchTickets = useCallback(async () => {
        try {
            const r = await apiFetch('/api/support/admin/tickets');
            if (r.ok) setTickets((await r.json()).tickets);
        } catch (e) {} finally { setLoading(false); }
    }, []);

    const fetchReplies = useCallback(async (id) => {
        try {
            const r = await apiFetch(`/api/support/tickets/${id}/replies`);
            if (r.ok) setReplies((await r.json()).replies);
        } catch (e) {}
    }, []);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    useEffect(() => {
        if (selectedId) {
            fetchReplies(selectedId);
            const id = setInterval(() => fetchReplies(selectedId), 10000);
            return () => clearInterval(id);
        }
    }, [selectedId, fetchReplies]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [replies]);

    const handleSend = async (e) => {
        e.preventDefault();
        if ((!newReply.trim() && !newFile) || busy) return;
        setBusy(true);
        try {
            const formData = new FormData();
            formData.append('message', newReply);
            if (newFile) formData.append('attachment', newFile);

            const r = await apiFetch(`/api/support/tickets/${selectedId}/replies`, {
                method: 'POST', body: formData
            });
            if (r.ok) {
                setNewReply('');
                setNewFile(null);
                fetchReplies(selectedId);
            }
        } catch (e) {} finally { setBusy(false); }
    };

    const toggleStatus = async (t) => {
        const next = t.status === 'open' ? 'closed' : 'open';
        try {
            const r = await apiFetch(`/api/support/admin/tickets/${t.id}/status`, {
                method: 'PUT', body: JSON.stringify({ status: next })
            });
            if (r.ok) fetchTickets();
        } catch (e) {}
    };

    const filtered = tickets.filter(t => 
        (filter === 'all' || t.status === filter) &&
        (t.subject.toLowerCase().includes(search.toLowerCase()) || t.memberName.toLowerCase().includes(search.toLowerCase()))
    );

    const selected = tickets.find(t => t.id === selectedId);

    if (loading) return <div style={{ padding: '6rem', textAlign: 'center' }}><Clock className="spin text-accent" size={48} /></div>;

    return (
        <div className="support-page" style={{ height: 'calc(100vh - 140px)', display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1px', background: 'var(--border)', margin: '-2rem', overflow: 'hidden' }}>
            
            {/* --- TICKET LIST SIDEBAR --- */}
            <div style={{ background: 'var(--card-bg)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Inbox size={20} className="text-accent" /> Support Queue
                    </h2>
                    <div className="search-box" style={{ marginBottom: '1rem' }}>
                        <Search size={16} />
                        <input placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {['open', 'closed', 'all'].map(f => (
                            <button 
                                key={f} 
                                onClick={() => setFilter(f)}
                                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                                style={{ flex: 1, textTransform: 'capitalize', fontSize: '0.7rem' }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filtered.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>No tickets found.</div>}
                    {filtered.map(t => (
                        <div 
                            key={t.id} 
                            onClick={() => setSelectedId(t.id)}
                            style={{ 
                                padding: '1.25rem', 
                                cursor: 'pointer', 
                                borderBottom: '1px solid var(--border)',
                                background: selectedId === t.id ? 'var(--accent-dim)' : 'transparent',
                                borderLeft: selectedId === t.id ? '4px solid var(--accent)' : '4px solid transparent',
                                transition: '0.2s'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-dim)' }}>#{t.id} • {t.category}</span>
                                <span className={`badge badge-${t.status === 'open' ? 'success' : 'secondary'}`} style={{ fontSize: '0.6rem' }}>{t.status}</span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>{t.subject}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.memberName}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- CHAT INTERFACE --- */}
            <div style={{ background: 'var(--bg-body)', display: 'flex', flexDirection: 'column' }}>
                <AnimatePresence mode="wait">
                    {!selectedId ? (
                        <motion.div 
                            key="none"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                        >
                            <MessageSquare size={64} style={{ marginBottom: '1.5rem' }} />
                            <h3>Select a ticket to begin resolution</h3>
                            <p>All member communications are logged and audited.</p>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key={selectedId}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                        >
                            {/* Chat Header */}
                            <div style={{ padding: '1.25rem 2rem', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <h3 style={{ margin: 0, fontWeight: 900 }}>{selected?.subject}</h3>
                                        <span className={`badge badge-${selected?.priority === 'high' ? 'danger' : 'accent'}`}>{selected?.priority}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                        Principal: <strong>{selected?.memberName}</strong> ({selected?.membershipNumber})
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button 
                                        className={`btn btn-sm ${selected?.status === 'open' ? 'btn-danger-outline' : 'btn-success'}`}
                                        onClick={() => toggleStatus(selected)}
                                    >
                                        {selected?.status === 'open' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                                        {selected?.status === 'open' ? 'Resolve & Close' : 'Re-open Ticket'}
                                    </button>
                                </div>
                            </div>

                            {/* Chat Body */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {/* Original Message */}
                                <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border)', maxWidth: '80%' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '0.75rem' }}>ORIGINAL ISSUE REPORT</div>
                                    <div style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{selected?.description}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '1rem' }}>{new Date(selected?.timestamp).toLocaleString()}</div>
                                </div>

                                {replies.map(r => (
                                    <div 
                                        key={r.id} 
                                        style={{ 
                                            alignSelf: r.authorType === 'admin' ? 'flex-end' : 'flex-start',
                                            maxWidth: '75%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: r.authorType === 'admin' ? 'flex-end' : 'flex-start'
                                        }}
                                    >
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, marginBottom: '0.4rem', color: 'var(--text-dim)' }}>
                                            {r.authorType === 'admin' ? 'YOU' : r.authorName.toUpperCase()}
                                        </div>
                                        <div style={{ 
                                            padding: '1rem 1.25rem', 
                                            borderRadius: 16, 
                                            background: r.authorType === 'admin' ? 'var(--accent)' : 'var(--card-bg)',
                                            color: r.authorType === 'admin' ? '#000' : 'var(--text-primary)',
                                            border: r.authorType === 'admin' ? 'none' : '1px solid var(--border)',
                                            boxShadow: 'var(--shadow-sm)',
                                            fontSize: '0.9rem',
                                            lineHeight: 1.5
                                        }}>
                                            {r.message}
                                        </div>
                                        {r.attachmentUrl && (
                                            <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--card-bg)', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                                                <Paperclip size={14} className="text-accent" />
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>File Attachment</span>
                                                <button onClick={() => window.open(`${r.attachmentUrl}?token=${getToken()}`, '_blank')} className="btn btn-ghost btn-sm" style={{ padding: '2px' }}><Download size={14} /></button>
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                                            {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat Input */}
                            <div style={{ padding: '1.5rem 2rem', background: 'var(--card-bg)', borderTop: '1px solid var(--border)' }}>
                                {selected?.status === 'closed' ? (
                                    <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-body)', borderRadius: 8, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                        This ticket is closed. Re-open it to send further messages.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {newFile && (
                                            <div style={{ padding: '0.5rem', background: 'var(--accent-dim)', borderRadius: 8, fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>📎 {newFile.name}</span>
                                                <button className="btn btn-ghost" style={{ padding: '2px', color: 'var(--danger)' }} onClick={() => setNewFile(null)}>✕</button>
                                            </div>
                                        )}
                                        <form onSubmit={handleSend} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <label className="btn btn-ghost btn-icon" style={{ cursor: 'pointer', flexShrink: 0 }}>
                                                <input type="file" style={{ display: 'none' }} onChange={e => setNewFile(e.target.files[0])} />
                                                <Paperclip size={20} />
                                            </label>
                                            <input 
                                                className="input" 
                                                style={{ flex: 1, height: 48 }}
                                                placeholder="Type your response here..."
                                                value={newReply}
                                                onChange={e => setNewReply(e.target.value)}
                                                autoFocus
                                            />
                                            <button type="submit" className="btn btn-primary" disabled={(!newReply.trim() && !newFile) || busy} style={{ width: 120, height: 48 }}>
                                                {busy ? <Clock className="spin" size={18} /> : <Send size={18} />} Send
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default SupportTickets;
