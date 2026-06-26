import { useState, useEffect, useCallback } from 'react';
import { apiFetch, memberFetch, downloadBlob, memberDownloadBlob, viewBlob, memberViewBlob, getRole, getUsername } from '../utils/api';

const CATEGORIES = ['Constitution', 'Receipts', 'Reports', 'Legal', 'Minutes', 'Financial', 'Other'];

const DocumentVault = () => {
    const [docs,      setDocs]      = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [modal,     setModal]     = useState(false);
    const [toast,     setToast]     = useState(null);
    const [filter,    setFilter]    = useState('all');
    const [search,    setSearch]    = useState('');
    const [myUploadsOnly, setMyUploadsOnly] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form,      setForm]      = useState({ title: '', category: 'Other', description: '' });
    
    const isMember = window.location.pathname.includes('/member/');
    const fetcher = isMember ? memberFetch : apiFetch;

    const load = useCallback(() => {
        setLoading(true);
        fetcher('/api/documents/vault').then(r => r.json()).then(d => {
            setDocs(d.documents || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const handleUpload = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('vault-file-input');
        if (!fileInput?.files[0] || !form.title) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            fd.append('title', form.title);
            fd.append('category', form.category);
            fd.append('description', form.description);
            const r = await fetcher('/api/documents/vault', { method: 'POST', body: fd, headers: {} });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            showToast('✓ Document uploaded.');
            setModal(false);
            setForm({ title: '', category: 'Other', description: '' });
            load();
        } catch (err) { showToast(err.message, 'error'); }
        setUploading(false);
    };

    const deleteDoc = async (id) => {
        if (!confirm('Delete this document?')) return;
        try {
            await fetcher(`/api/documents/vault/${id}`, { method: 'DELETE' });
            showToast('Document deleted.');
            load();
        } catch (err) { showToast(err.message, 'error'); }
    };

    const currentUser = getUsername();
    const filtered = docs.filter(d => {
        if (filter !== 'all' && d.category !== filter) return false;
        if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (myUploadsOnly && (!d.uploadedBy || d.uploadedBy.toLowerCase() !== currentUser.toLowerCase())) return false;
        return true;
    });

    const categories = [...new Set(docs.map(d => d.category))];

    return (
        <div>
            <div className="section-header">
                <h2>📁 Document Vault</h2>
                {!isMember && <button className="btn btn-primary" onClick={() => setModal(true)}>+ Upload Document</button>}
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {/* Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '1.5rem' }}>
                <div className="stat-card"><div className="label">Total Documents</div><div className="value">{docs.length}</div></div>
                {categories.slice(0, 4).map(c => (
                    <div key={c} className="stat-card"><div className="label">{c}</div><div className="value">{docs.filter(d => d.category === c).length}</div></div>
                ))}
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search documents…" style={{ flex: 1, minWidth: 200 }} />
                        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
                            <option value="all">All Categories</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    {!isMember && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', background: 'var(--bg)', padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid var(--border)' }}>
                            <input type="checkbox" checked={myUploadsOnly} onChange={e => setMyUploadsOnly(e.target.checked)} />
                            👤 My Uploads Only
                        </label>
                    )}
                </div>
            </div>

            {/* Documents grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {loading ? (
                    <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Loading…</p></div>
                ) : filtered.length === 0 ? (
                    <div className="card"><p style={{ color: 'var(--text-secondary)' }}>No documents found.</p></div>
                ) : filtered.map(d => (
                    <div key={d.id} className="card" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>📄 {d.title}</h4>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>{d.category}</span>
                        </div>
                        {d.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{d.description}</p>}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                            Uploaded by {d.uploadedBy} · {new Date(d.uploadDate).toLocaleDateString('en-GB')}
                        </div>
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
                                    onClick={() => (isMember ? memberDownloadBlob : downloadBlob)(`/api/documents/vault/${d.filename}`, d.filename)}>⬇ Download</button>
                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', background: 'var(--accent)', color: '#fff', border: 'none' }}
                                    onClick={() => (isMember ? memberViewBlob : viewBlob)(`/api/documents/vault/${d.filename}`)}>👁 View</button>
                                {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) ? (
                                    <button className="btn btn-danger btn-icon" style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem' }}
                                        onClick={() => deleteDoc(d.id)} title="Delete">🗑</button>
                                ) : (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>—</span>
                                )}
                            </div>
                    </div>
                ))}
            </div>

            {/* Upload Modal */}
            {modal && (
                <div className="modal-overlay" onClick={() => setModal(false)}>
                    <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>📁 Upload Document</h3><button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}>✕</button></div>
                        <form onSubmit={handleUpload}>
                            <div className="form-grid">
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Title <span className="required">*</span></label>
                                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Group Constitution 2026" />
                                </div>
                                <div className="form-group">
                                    <label>Category</label>
                                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>File <span className="required">*</span></label>
                                    <input type="file" id="vault-file-input" required />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Description</label>
                                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? 'Uploading…' : '+ Upload'}</button>
                                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


        </div>
    );
};

export default DocumentVault;
