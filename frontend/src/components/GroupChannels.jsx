import { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Hash, Users, Plus, Send, XCircle, Paperclip, CheckCircle, Search, Shield, User, Download, Eye,
    MessageCircle, Trash2
} from 'lucide-react';
import { apiFetch, memberFetch, getRole, getUsername, getToken, getMemberToken, getAdminId, viewBlob, memberViewBlob, downloadBlob, memberDownloadBlob, getRoleLabel } from '../utils/api';

const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const GroupChannels = ({ context = 'admin', memberDetails = null }) => {
    const [channels, setChannels] = useState([]);
    const [activeChannel, setActiveChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [channelMembers, setChannelMembers] = useState([]);
    
    // UI state
    const [msgInput, setMsgInput] = useState('');
    const [msgFile, setMsgFile] = useState(null);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState(null); // 'create' | 'add_members'
    const [loading, setLoading] = useState(false);
    
    // Create form
    const [formChannel, setFormChannel] = useState({ name: '', description: '' });
    
    // Add Members form
    const [allMembers, setAllMembers] = useState([]);
    const [allAdmins, setAllAdmins] = useState([]);
    const [selectedMembers, setSelectedMembers] = useState([]);
    
    const chatEndRef = useRef(null);

    const getFetcher = useCallback(() => context === 'member' ? memberFetch : apiFetch, [context]);
    const getTokenFn = useCallback(() => context === 'member' ? getMemberToken : getToken, [context]);
    const getViewFn = useCallback(() => context === 'member' ? memberViewBlob : viewBlob, [context]);

    const fetchChannels = useCallback(async () => {
        try {
            const res = await getFetcher()(`/api/comm/channels`);
            const data = await res.json();
            setChannels(data.channels || []);
        } catch (err) { console.error('Channels fetch error:', err); }
    }, [getFetcher]);

    const fetchMessages = useCallback(async (channelId) => {
        try {
            const res = await getFetcher()(`/api/comm/channels/${channelId}/messages`);
            const data = await res.json();
            setMessages(data.messages || []);
            scrollToBottom();
        } catch (err) { console.error('Messages error:', err); }
    }, [getFetcher]);

    const fetchChannelMembers = useCallback(async (channelId) => {
        try {
            const res = await getFetcher()(`/api/comm/channels/${channelId}/members`);
            const data = await res.json();
            setChannelMembers(data.members || []);
        } catch (err) { console.error('Members error:', err); }
    }, [getFetcher]);

    const fetchAllUsersForInvite = async () => {
        if (context !== 'admin') return;
        try {
            const [mRes, aRes] = await Promise.all([
                apiFetch('/api/members'),
                apiFetch('/api/auth/users')
            ]);
            const mData = await mRes.json();
            const aData = await aRes.json();
            setAllMembers(mData.members || []);
            setAllAdmins(aData.users || []);
        } catch (err) { console.error('Users error:', err); }
    };

    useEffect(() => {
        fetchChannels();
        const id = setInterval(fetchChannels, 15000);
        return () => clearInterval(id);
    }, [fetchChannels]);

    useEffect(() => {
        if (activeChannel) {
            fetchMessages(activeChannel.id);
            fetchChannelMembers(activeChannel.id);
            const id = setInterval(() => fetchMessages(activeChannel.id), 5000);
            return () => clearInterval(id);
        }
    }, [activeChannel, fetchMessages, fetchChannelMembers]);

    const scrollToBottom = () => {
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleCreateChannel = async (e) => {
        e.preventDefault();
        try {
            const res = await getFetcher()('/api/comm/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formChannel)
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setModal(null);
            setFormChannel({ name: '', description: '' });
            fetchChannels();
        } catch (err) { alert(err.message); }
    };

    const handleAddMembers = async (e) => {
        e.preventDefault();
        if (selectedMembers.length === 0 || !activeChannel) return;
        try {
            const res = await getFetcher()(`/api/comm/channels/${activeChannel.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ membersToAdd: selectedMembers })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setModal(null);
            setSelectedMembers([]);
            fetchChannelMembers(activeChannel.id);
        } catch (err) { alert(err.message); }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!msgInput.trim() && !msgFile) || !activeChannel) return;
        
        const form = new FormData();
        form.append('content', msgInput);
        if (msgFile) form.append('attachment', msgFile);

        try {
            await getFetcher()(`/api/comm/channels/${activeChannel.id}/messages`, {
                method: 'POST',
                body: form
            });
            setMsgInput('');
            setMsgFile(null);
            fetchMessages(activeChannel.id);
        } catch (err) { alert(err.message); }
    };

    const handleDeleteChannel = async () => {
        if (!activeChannel) return;
        try {
            const res = await getFetcher()(`/api/comm/channels/${activeChannel.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error);
            setActiveChannel(null);
            setModal(null);
            fetchChannels();
        } catch (err) { alert(err.message); }
    };

    const renderAttachment = (url) => {
        if (!url) return null;
        const secureUrl = `${url}?token=${getTokenFn()()}`;
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
                        onClick={() => getViewFn()(url)}
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

    const toggleMemberSelection = (id, type) => {
        setSelectedMembers(prev => {
            const exists = prev.find(p => p.id === id && p.type === type);
            if (exists) return prev.filter(p => !(p.id === id && p.type === type));
            return [...prev, { id, type }];
        });
    };

    const isSelected = (id, type) => selectedMembers.some(p => p.id === id && p.type === type);

    const filteredChannels = channels.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ flex: 1, display: 'flex', gap: '1.25rem', overflow: 'hidden', height: '100%' }}>
            {/* Sidebar */}
            <div className="card shadow-sm" style={{ width: 320, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Hash size={16} className="text-dim" /> Channels</h3>
                    {context === 'admin' && (
                        <button className="btn btn-ghost btn-icon" onClick={() => setModal('create')} title="New Channel">
                            <Plus size={16} />
                        </button>
                    )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                        <input 
                            type="text" 
                            className="input" 
                            placeholder="Find a channel..." 
                            style={{ paddingLeft: 30, fontSize: '0.8rem', height: 36 }}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {filteredChannels.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '2rem 0' }}>No channels found.</div>
                    ) : (
                        filteredChannels.map(c => (
                            <div 
                                key={c.id} 
                                onClick={() => setActiveChannel(c)}
                                style={{ 
                                    padding: '0.6rem 0.75rem', 
                                    cursor: 'pointer', 
                                    background: activeChannel?.id === c.id ? 'var(--accent-dim)' : 'transparent',
                                    color: activeChannel?.id === c.id ? 'var(--accent)' : 'var(--text-primary)',
                                    fontWeight: activeChannel?.id === c.id ? 700 : 500,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Hash size={14} opacity={0.6} /> 
                                # {c.name.replace(/\s+/g, '-').toLowerCase()}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Interface */}
            <div className="card shadow-sm" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
                {activeChannel ? (
                    <>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-body)', borderRadius: '14px 14px 0 0' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Hash size={18} className="text-dim" /> {activeChannel.name}
                                </h3>
                                {/* Participants count */}
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                                    <Users size={12} /> {channelMembers.length} participants
                                    {activeChannel.description && <span>• {activeChannel.description}</span>}
                                </p>
                            </div>
                            {context === 'admin' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {(Number(activeChannel.createdBy) === Number(getAdminId()) || ['superadmin', 'ict_admin'].includes(getRole())) && (
                                        <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--danger)', padding: '0.4rem 0.6rem' }} onClick={() => setModal('delete')} title="Delete Channel">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => { fetchAllUsersForInvite(); setModal('add_members'); }}>
                                        <Plus size={14} style={{ marginRight: 4 }} /> Add Members
                                    </button>
                                </div>
                            )}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {messages.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                    <MessageCircle size={48} opacity={0.2} style={{ marginBottom: '1rem' }} />
                                    <p>Welcome to #{activeChannel.name}!</p>
                                    <p style={{ fontSize: '0.8rem' }}>This is the beginning of the channel history.</p>
                                </div>
                            )}
                            {messages.map(m => {
                                const isMe = (context === 'admin' && m.senderType === 'admin' && m.senderName === getUsername()) || 
                                             (context === 'member' && m.senderType === 'member' && Number(m.senderId) === Number(memberDetails?.id));
                                
                                return (
                                    <div key={m.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%', display: 'flex', flexDirection: 'column' }}>
                                        {!isMe && (
                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: m.senderType === 'admin' ? 'var(--accent)' : 'var(--text-secondary)', marginBottom: '0.2rem', paddingLeft: '0.5rem' }}>
                                                {m.senderName} {m.senderType === 'admin' ? '(Admin)' : ''}
                                            </div>
                                        )}
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
                                            {m.content && <div>{m.content}</div>}
                                            {renderAttachment(m.attachmentUrl)}
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
                            {msgFile && (
                                <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>📎 {msgFile.name}</span>
                                    <button className="btn btn-ghost" style={{ padding: '0.2rem', color: 'var(--danger)' }} onClick={() => setMsgFile(null)}>
                                        <XCircle size={14} />
                                    </button>
                                </div>
                            )}
                            <form onSubmit={handleSendMessage} style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <label className="btn btn-ghost btn-icon" style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>
                                    <input type="file" style={{ display: 'none' }} onChange={e => setMsgFile(e.target.files[0])} />
                                    <Paperclip size={18} />
                                </label>
                                <input 
                                    className="input" 
                                    placeholder={`Message #${activeChannel.name}...`}
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
                        <Hash size={48} opacity={0.2} />
                        <p>Select a channel or create a new one to join the conversation.</p>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {modal === 'delete' && (
                <div className="modal-overlay" onClick={() => setModal(null)}>
                    <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}><Trash2 size={18} /> Delete Channel</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><XCircle size={20} /></button>
                        </div>
                        <div style={{ padding: '1rem 0' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: '1.5' }}>
                                Are you absolutely sure you want to delete <strong>#{activeChannel?.name}</strong>?
                            </p>
                            <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.4' }}>
                                This will permanently erase the channel, along with all of its messages, document attachments, and member associations. This action cannot be reversed.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button type="button" className="btn btn-ghost" style={{ flex: 1, backgroundColor: 'var(--danger)', color: '#fff' }} onClick={handleDeleteChannel}>
                                Yes, Delete Channel
                            </button>
                            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Channel Modal */}
            {modal === 'create' && (
                <div className="modal-overlay" onClick={() => setModal(null)}>
                    <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Hash size={18} className="text-accent" /> Create a Channel</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><XCircle size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            Channels are where members and admins communicate. They're best organized around a topic.
                        </p>
                        <form onSubmit={handleCreateChannel}>
                            <div className="form-group">
                                <label>Channel Name</label>
                                <input 
                                    className="input" 
                                    placeholder="e.g. project-updates" 
                                    required
                                    value={formChannel.name}
                                    onChange={e => setFormChannel({ ...formChannel, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                                />
                                <small style={{ color: 'var(--text-dim)' }}>Lowercase, numbers, and hyphens only.</small>
                            </div>
                            <div className="form-group">
                                <label>Description <small>(Optional)</small></label>
                                <input 
                                    className="input" 
                                    placeholder="What is this channel about?"
                                    value={formChannel.description}
                                    onChange={e => setFormChannel({ ...formChannel, description: e.target.value })}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Create Channel</button>
                                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Members Modal */}
            {modal === 'add_members' && (
                <div className="modal-overlay" onClick={() => setModal(null)}>
                    <div className="modal-box" style={{ maxWidth: 600, minHeight: 400, display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={18} className="text-accent" /> Add Participants to #{activeChannel.name}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><XCircle size={20} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <div style={{ padding: '0.75rem', background: 'var(--bg-body)', borderBottom: '1px solid var(--border)' }}>
                                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', margin: 0 }}>Administrators</h4>
                            </div>
                            {allAdmins.map(a => (
                                <div key={`admin-${a.id}`} style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Shield size={16} color="var(--accent)" />
                                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{a.username}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>({getRoleLabel(a.role)})</span>
                                    </div>
                                    <button 
                                        className={`btn ${isSelected(a.id, 'admin') ? 'btn-primary' : 'btn-ghost'}`}
                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                        onClick={() => toggleMemberSelection(a.id, 'admin')}
                                    >
                                        {isSelected(a.id, 'admin') ? 'Selected' : 'Select'}
                                    </button>
                                </div>
                            ))}
                            <div style={{ padding: '0.75rem', background: 'var(--bg-body)', borderBottom: '1px solid var(--border)' }}>
                                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em', margin: 0 }}>Members</h4>
                            </div>
                            {allMembers.map(m => (
                                <div key={`member-${m.id}`} style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <User size={16} color="var(--text-secondary)" />
                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{m.name}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>({m.membershipNumber || m.phone})</span>
                                    </div>
                                    <button 
                                        className={`btn ${isSelected(m.id, 'member') ? 'btn-primary' : 'btn-ghost'}`}
                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                        onClick={() => toggleMemberSelection(m.id, 'member')}
                                    >
                                        {isSelected(m.id, 'member') ? 'Selected' : 'Select'}
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{selectedMembers.length} users selected</span>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button type="button" className="btn btn-primary" onClick={handleAddMembers} disabled={selectedMembers.length === 0}>
                                    Add to Channel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GroupChannels;
