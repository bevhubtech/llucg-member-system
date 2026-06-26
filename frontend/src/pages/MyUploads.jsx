import { useState, useEffect, useCallback } from 'react';
import { apiFetch, downloadBlob, viewBlob, getRole } from '../utils/api';
import { 
    Upload, FileText, Download, Eye, Clock, 
    Filter, Search, User, Briefcase, Receipt,
    Plus, X, CheckCircle2, AlertCircle
} from 'lucide-react';

const CATEGORIES = ['Constitution', 'Receipts', 'Reports', 'Legal', 'Minutes', 'Financial', 'Other'];

const MyUploads = () => {
    const [uploads, setUploads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState(null);
    const [modal, setModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({ title: '', category: 'Other', description: '' });

    const fetchUploads = useCallback(() => {
        setLoading(true);
        apiFetch('/api/documents/my-uploads')
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setUploads(data.uploads || []);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        fetchUploads();
    }, [fetchUploads]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('my-uploads-file');
        if (!fileInput?.files[0] || !form.title) return;
        
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            fd.append('title', form.title);
            fd.append('category', form.category);
            fd.append('description', form.description);
            
            const r = await apiFetch('/api/documents/vault', { method: 'POST', body: fd, headers: {} });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            
            showToast('✓ Document successfully uploaded to Vault.');
            setModal(false);
            setForm({ title: '', category: 'Other', description: '' });
            fetchUploads();
        } catch (err) {
            showToast(err.message, 'error');
        }
        setUploading(false);
    };

    const getDownloadPath = (u) => {
        switch (u.type) {
            case 'Vault Document': return `/api/documents/vault/${u.filename}`;
            case 'Expense Receipt': return `/api/finance/receipt/${u.filename}`; // Updated mapping
            case 'Member KYC': return `/api/documents/kyc/${u.filename}`; // Updated mapping
            default: return `/api/documents/vault/${u.filename}`;
        }
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'Vault Document': return <Briefcase size={16} />;
            case 'Expense Receipt': return <Receipt size={16} />;
            case 'Member KYC': return <User size={16} />;
            default: return <FileText size={16} />;
        }
    };

    const filtered = uploads.filter(u => 
        u.name.toLowerCase().includes(search.toLowerCase()) || 
        u.type.toLowerCase().includes(search.toLowerCase()) ||
        (u.details || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="section-header">
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>📁 My Document Portal</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Track and manage all documents you've uploaded across the ecosystem.
                    </p>
                </div>
                <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }} onClick={() => setModal(true)}>
                    <Upload size={18} /> Upload to Vault
                </button>
            </div>

            {toast && (
                <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {toast.msg}
                </div>
            )}

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-card)', borderLeft: '4px solid var(--accent)' }}>
                    <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Total Contributed</p>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{uploads.length} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-dim)' }}>Files</span></h2>
                </div>
                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-card)', borderLeft: '4px solid #10b981' }}>
                    <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Vault Assets</p>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{uploads.filter(u => u.type === 'Vault Document').length}</h2>
                </div>
                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-card)', borderLeft: '4px solid #f59e0b' }}>
                    <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>KYC Processed</p>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{uploads.filter(u => u.type === 'Member KYC').length}</h2>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                    <input 
                        className="input" 
                        placeholder="Search by title, type, or details..." 
                        style={{ paddingLeft: '2.75rem', width: '100%' }}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                    <table className="table-hover">
                        <thead>
                            <tr>
                                <th>Resource Name</th>
                                <th>Source / Type</th>
                                <th>Context</th>
                                <th><Clock size={14} /> Upload Date</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>Syncing your records...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>No matching records found.</td></tr>
                            ) : (
                                filtered.map((u, i) => (
                                    <tr key={`${u.type}-${u.id}-${i}`}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                                    {getTypeIcon(u.type)}
                                                </div>
                                                <strong style={{ fontSize: '0.9rem' }}>{u.name}</strong>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {u.type === 'Vault Document' ? 'Vault' : u.type === 'Expense Receipt' ? 'Accounts' : 'Compliance'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{u.details}</td>
                                        <td style={{ fontSize: '0.85rem' }}>{new Date(u.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-ghost btn-icon" onClick={() => viewBlob(getDownloadPath(u))} title="Quick View"><Eye size={16} /></button>
                                                <button className="btn btn-ghost btn-icon" onClick={() => downloadBlob(getDownloadPath(u), u.filename)} title="Download"><Download size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Upload Modal */}
            {modal && (
                <div className="modal-overlay" onClick={() => setModal(false)}>
                    <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Plus size={20} className="text-accent" /> New Vault Resource</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpload}>
                            <div className="form-grid">
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Document Title <span className="required">*</span></label>
                                    <input 
                                        value={form.title} 
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                                        required 
                                        placeholder="e.g. Q1 Financial Performance Report" 
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Classification</label>
                                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Select File <span className="required">*</span></label>
                                    <input type="file" id="my-uploads-file" required style={{ paddingTop: '0.4rem' }} />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Administrative Note</label>
                                    <textarea 
                                        className="input"
                                        style={{ width: '100%', minHeight: 80, padding: '0.75rem' }}
                                        value={form.description} 
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                                        placeholder="Briefly describe the purpose of this upload..." 
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={uploading}>
                                    {uploading ? 'Processing Transaction...' : 'Confirm & Upload'}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyUploads;
