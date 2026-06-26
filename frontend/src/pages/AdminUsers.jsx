import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { apiFetch, getRoleLabel } from '../utils/api';

const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
         + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const RolePill = ({ role }) => {
    const styles = {
        superadmin:    { bg: 'rgba(251,191,36,0.12)',  col: '#fbbf24', bc: 'rgba(251,191,36,0.3)',  label: '★ ' + getRoleLabel('superadmin') },
        treasurer:     { bg: 'rgba(16,185,129,0.12)',  col: '#10b981', bc: 'rgba(16,185,129,0.3)',  label: '💰 ' + getRoleLabel('treasurer') },
        secretary:     { bg: 'rgba(236,72,153,0.12)',  col: '#ec4899', bc: 'rgba(236,72,153,0.3)',  label: '📝 ' + getRoleLabel('secretary') },
        finance_admin: { bg: 'rgba(20,184,166,0.12)',  col: '#14b8a6', bc: 'rgba(20,184,166,0.3)',  label: '📊 ' + getRoleLabel('finance_admin') },
        ict_admin:     { bg: 'rgba(139,92,246,0.12)',  col: '#8b5cf6', bc: 'rgba(139,92,246,0.3)',  label: '🛠 ' + getRoleLabel('ict_admin') },
        admin:         { bg: 'rgba(99,102,241,0.12)',  col: 'var(--accent)', bc: 'var(--accent-border)', label: getRoleLabel('admin') },
    };
    const s = styles[role] || styles.admin;
    return (
        <span style={{
            display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 5,
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            background: s.bg, color: s.col, border: `1px solid ${s.bc}`,
        }}>
            {s.label}
        </span>
    );
};

const AdminUsers = () => {
    const [users,   setUsers]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast,   setToast]   = useState(null);

    // Add form state
    const emptyForm = { username: '', password: '', role: 'admin' };
    const [showAdd,  setShowAdd]  = useState(false);
    const [addForm,  setAddForm]  = useState(emptyForm);
    const [addErr,   setAddErr]   = useState('');
    const [saving,   setSaving]   = useState(false);

    // Edit role inline
    const [editId,  setEditId]  = useState(null);
    const [editRole,setEditRole]= useState('admin');
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Reset password
    const [resetId,  setResetId]  = useState(null);
    const [resetPwd, setResetPwd] = useState('');
    const [resetErr, setResetErr] = useState('');
    const [showAddPassword, setShowAddPassword]     = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);

    // Smart Table logic
    const [currentPage, setCurrentPage] = useState(1);
    const [sortKey, setSortKey] = useState('id');
    const [sortDesc, setSortDesc] = useState(false);
    const usersPerPage = 10;

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res  = await apiFetch('/api/auth/users');
            const data = await res.json();
            console.log('[Admins] Fetched list:', data.users);
            setUsers(data.users || []);
        } catch (err) { 
            console.error('[Admins] Fetch failure:', err);
            showToast('Failed to load administrators. See console for details.', 'error');
        }
        setLoading(false);
    };

    useEffect(() => { fetchUsers(); }, []);

    /* ── Create admin ── */
    const handleAdd = async (e) => {
        e.preventDefault();
        setAddErr(''); setSaving(true);
        try {
            const res  = await apiFetch('/api/auth/users', { method: 'POST', body: JSON.stringify(addForm) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`Admin "${addForm.username}" created successfully.`);
            setAddForm(emptyForm); setShowAdd(false);
            fetchUsers();
        } catch (e) { setAddErr(e.message); }
        setSaving(false);
    };

    /* ── Change role ── */
    const handleRoleChange = async (id) => {
        try {
            const res  = await apiFetch(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify({ role: editRole }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Role updated.');
            setEditId(null);
            fetchUsers();
        } catch (e) { showToast(e.message, 'error'); }
    };

    /* ── Reset password ── */
    const handleResetPwd = async (e) => {
        e.preventDefault();
        setResetErr('');
        try {
            const res  = await apiFetch(`/api/auth/users/${resetId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: resetPwd }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Password reset successfully.');
            setResetId(null); setResetPwd('');
        } catch (e) { setResetErr(e.message); }
    };

    /* ── Delete ── */
    const handleDeleteRequest = (u) => {
        setConfirmDelete(u);
    };

    const executeDelete = async () => {
        const u = confirmDelete;
        setConfirmDelete(null);
        if (!u) return;
        try {
            const res  = await apiFetch(`/api/auth/users/${u.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`Admin "${u.username}" deleted.`);
            fetchUsers();
        } catch (e) { showToast(e.message, 'error'); }
    };

    // Pagination & Sorting calculations
    const sortedUsers = [...users].sort((a, b) => {
        let vA = a[sortKey];
        let vB = b[sortKey];
        if (typeof vA === 'string') vA = vA.toLowerCase();
        if (typeof vB === 'string') vB = vB.toLowerCase();
        if (vA < vB) return sortDesc ? 1 : -1;
        if (vA > vB) return sortDesc ? -1 : 1;
        return 0;
    });

    const totalPages = Math.ceil(sortedUsers.length / usersPerPage) || 1;
    // ensure current page is within bounds after deletes
    const validCurrentPage = Math.min(currentPage, totalPages);
    const currentUsers = sortedUsers.slice((validCurrentPage - 1) * usersPerPage, validCurrentPage * usersPerPage);

    const handleSort = (k) => {
        if (sortKey === k) setSortDesc(!sortDesc);
        else { setSortKey(k); setSortDesc(false); }
    };

    const SortIcon = ({ colKey }) => {
        if (sortKey !== colKey) return <span style={{ opacity: 0.3, fontSize: '0.7rem', marginLeft: 4 }}>↕</span>;
        return <span style={{ fontSize: '0.7rem', marginLeft: 4, color: 'var(--accent)' }}>{sortDesc ? '↓' : '↑'}</span>;
    };

    return (
        <div>
            {/* ── Header ── */}
            <div className="section-header">
                <div>
                    <h2>Admin Users</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Manage who can access this portal and their permission level.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-ghost" onClick={fetchUsers}>↻ Refresh</button>
                    <button className="btn btn-primary" onClick={() => { setShowAdd(s => !s); setAddErr(''); }}>
                        {showAdd ? 'Cancel' : '+ New Admin'}
                    </button>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            {/* ── Role legend ── */}
            <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '1rem 1.5rem' }}>
                <div>
                    <RolePill role="superadmin" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Full access — manage admin users, all data, settings.
                    </p>
                </div>
                <div>
                    <RolePill role="admin" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Manage members, payments, meetings, reports, send SMS.
                    </p>
                </div>
                <div>
                    <RolePill role="finance_admin" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Finance only — Payments, Loans, Penalties, Investments, Expenses, Dividends, Reports. No member CRUD, meetings, polls, or settings.
                    </p>
                </div>
                <div>
                    <RolePill role="treasurer" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Same financial access as Admin, no member write access.
                    </p>
                </div>
                <div>
                    <RolePill role="ict_admin" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Technical oversight — access to system logs, settings, and health dashboard.
                    </p>
                </div>
                <div>
                    <RolePill role="secretary" />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Manages members and meetings/polls. No financial access.
                    </p>
                </div>
            </div>

            {/* ── Add form ── */}
            {showAdd && (
                <div className="card card-highlight" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1.25rem' }}>Create New Admin Account</h3>
                    {addErr && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{addErr}</div>}
                    <form onSubmit={handleAdd}>
                        <div className="form-grid">
                            <div className="form-group">
                                <label>Username <span className="required">*</span></label>
                                <input
                                    name="username" required
                                    value={addForm.username}
                                    onChange={e => setAddForm({ ...addForm, username: e.target.value })}
                                    placeholder="e.g. john"
                                    autoComplete="off"
                                />
                            </div>
                            <div className="form-group">
                                <label>Password <span className="required">*</span></label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showAddPassword ? 'text' : 'password'} name="password" required minLength={6}
                                        value={addForm.password}
                                        onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                                        placeholder="Min 6 characters"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        onClick={() => setShowAddPassword(!showAddPassword)}
                                        title={showAddPassword ? 'Hide' : 'Show'}
                                    >
                                        {showAddPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Role</label>
                                <select value={addForm.role} onChange={e => setAddForm({ ...addForm, role: e.target.value })}>
                                    <option value="admin">{getRoleLabel('admin')}</option>
                                    <option value="finance_admin">{getRoleLabel('finance_admin')}</option>
                                    <option value="treasurer">{getRoleLabel('treasurer')}</option>
                                    <option value="secretary">{getRoleLabel('secretary')}</option>
                                    <option value="ict_admin">{getRoleLabel('ict_admin')}</option>
                                    <option value="superadmin">{getRoleLabel('superadmin')}</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Creating…' : 'Create Admin'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Reset Password modal ── */}
            {resetId && (
                <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => { setResetId(null); setResetPwd(''); setResetErr(''); }}>
                    <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Reset Password</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => { setResetId(null); setResetPwd(''); }}>✕</button>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            Set a new password for admin #{resetId}.
                        </p>
                        {resetErr && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{resetErr}</div>}
                        <form onSubmit={handleResetPwd}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>New Password <span className="required">*</span></label>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showResetPassword ? 'text' : 'password'} required minLength={6}
                                        value={resetPwd}
                                        onChange={e => setResetPwd(e.target.value)}
                                        placeholder="Min 6 characters"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        onClick={() => setShowResetPassword(!showResetPassword)}
                                        title={showResetPassword ? 'Hide' : 'Show'}
                                    >
                                        {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button type="submit" className="btn btn-primary">Reset Password</button>
                                <button type="button" className="btn btn-ghost" onClick={() => { setResetId(null); setResetPwd(''); }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Users table ── */}
            <div className="card">
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    # <SortIcon colKey="id" />
                                </th>
                                <th onClick={() => handleSort('username')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Username <SortIcon colKey="username" />
                                </th>
                                <th onClick={() => handleSort('role')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    Role <SortIcon colKey="role" />
                                </th>
                                <th style={{ textAlign: 'center' }}>Reset Pwd</th>
                                <th style={{ textAlign: 'center' }}>Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="skeleton-row">
                                        <td><div className="skeleton-box skeleton-text short"></div></td>
                                        <td><div className="skeleton-box skeleton-text medium"></div></td>
                                        <td><div className="skeleton-box skeleton-text"></div></td>
                                        <td><div className="skeleton-box skeleton-text short" style={{ margin: '0 auto', display: 'block' }}></div></td>
                                        <td><div className="skeleton-box skeleton-text short" style={{ margin: '0 auto', display: 'block' }}></div></td>
                                    </tr>
                                ))
                            ) : currentUsers.length === 0 ? (
                                <tr className="empty-row"><td colSpan="5">No admin accounts found.</td></tr>
                            ) : currentUsers.map(u => (
                                <tr key={u.id} className="hover-highlight">
                                    <td className="td-muted" style={{ width: 40 }}>{u.id}</td>
                                    <td><strong>{u.username}</strong></td>
                                    <td>
                                        {editId === u.id ? (
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <select
                                                    value={editRole}
                                                    onChange={e => setEditRole(e.target.value)}
                                                    style={{ width: 170 }}
                                                >
                                                    <option value="admin">{getRoleLabel('admin')}</option>
                                                    <option value="finance_admin">{getRoleLabel('finance_admin')}</option>
                                                    <option value="treasurer">{getRoleLabel('treasurer')}</option>
                                                    <option value="secretary">{getRoleLabel('secretary')}</option>
                                                    <option value="ict_admin">{getRoleLabel('ict_admin')}</option>
                                                    <option value="superadmin">{getRoleLabel('superadmin')}</option>
                                                </select>
                                                <button className="btn btn-primary btn-icon" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => handleRoleChange(u.id)}>Save</button>
                                                <button className="btn btn-ghost btn-icon" onClick={() => setEditId(null)}>✕</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <RolePill role={u.role} />
                                                <button
                                                    className="btn btn-ghost btn-icon"
                                                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                                                    onClick={() => { setEditId(u.id); setEditRole(u.role); }}
                                                    title="Change role"
                                                >
                                                    ✏️
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                                            onClick={() => { setResetId(u.id); setResetPwd(''); setResetErr(''); }}
                                            title="Reset password"
                                        >
                                            🔑 Reset
                                        </button>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className="btn btn-danger btn-icon"
                                            onClick={() => handleDeleteRequest(u)}
                                            title="Delete admin"
                                        >
                                            🗑
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Showing page {validCurrentPage} of {totalPages}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                                className="btn btn-ghost" 
                                disabled={validCurrentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            >
                                Previous
                            </button>
                            <button 
                                className="btn btn-ghost" 
                                disabled={validCurrentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Confirm Delete Modal ── */}
            {confirmDelete && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3>Confirm Deletion</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Are you sure you want to permanently delete admin <strong>{confirmDelete.username}</strong>?
                            <br /><br />
                            <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>This action cannot be undone.</span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-danger" onClick={executeDelete}>Yes, Delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUsers;
