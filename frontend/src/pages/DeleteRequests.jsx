import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getRole, getAdminId } from '../utils/api';

const DeleteRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [toast, setToast]       = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/delete-requests');
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            showToast(err.message, 'error');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const resolve = async (id, status) => {
        // Removed window.confirm for better UX and automation support
        try {
            const res = await apiFetch(`/api/delete-requests/${id}/resolve`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast(`Request ${status}.`);
            load();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    const role = getRole();

    return (
        <div>
            <div className="section-header">
                <h2>🛡️ Deletion Requests</h2>
                <button className="btn btn-ghost" onClick={load}>Refresh</button>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Requester</th>
                            <th>Entity</th>
                            <th>ID</th>
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading requests…</td></tr>
                        ) : requests.length === 0 ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No deletion requests found.</td></tr>
                        ) : requests.map(r => (
                            <tr key={r.id}>
                                <td>
                                    <div style={{ fontWeight: 600 }}>{r.requesterName} {r.requesterId == getAdminId() ? '(You)' : ''}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>ID: {r.requesterId}</div>
                                </td>
                                <td><span className="badge badge-primary" style={{ textTransform: 'capitalize' }}>{r.entityType}</span></td>
                                <td><code>#{r.entityId}</code></td>
                                <td style={{ maxWidth: '300px', fontSize: '0.85rem' }}>{r.reason}</td>
                                <td>
                                    <span className={`badge badge-${r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : 'danger'}`}>
                                        {r.status.toUpperCase()}
                                    </span>
                                    {r.processedAt && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                                            By {r.approverName}
                                        </div>
                                    )}
                                </td>
                                <td className="td-muted" style={{ fontSize: '0.75rem' }}>
                                    {new Date(r.timestamp).toLocaleString('en-GB')}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    {role === 'superadmin' ? (
                                        r.status === 'pending' ? (
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-success" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => resolve(r.id, 'approved')}>Approve</button>
                                                <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => resolve(r.id, 'denied')}>Deny</button>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Processed</span>
                                        )
                                    ) : (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{r.status === 'pending' ? 'Awaiting Approval' : 'Complete'}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <p>💡 <b>Note:</b> {role === 'superadmin' ? 'Approving a request grants the requester permission to perform the deletion.' : 'Once your request is approved, you will be able to delete the record in its module.'}</p>
            </div>
        </div>
    );
};

export default DeleteRequests;
