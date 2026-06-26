import { useState, useEffect, useCallback } from 'react';
import { apiFetch, getRole, getAdminId } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fmt = n => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORIES = ['Operations', 'Marketing', 'Events', 'Travel', 'Office Supplies', 'Professional Fees', 'Welfare', 'Miscellaneous'];

const BudgetModal = ({ period, onClose, onSaved, editing }) => {
    const [form, setForm] = useState(editing || { category: '', budgetedAmount: '' });
    const [err,  setErr]  = useState('');
    const [busy, setBusy] = useState(false);
    const h = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const url = editing ? `/api/budgets/${editing.id}` : '/api/budgets';
            const method = editing ? 'PUT' : 'POST';
            const body = editing
                ? { category: form.category, budgetedAmount: parseFloat(form.budgetedAmount) }
                : { category: form.category, budgetedAmount: parseFloat(form.budgetedAmount), period };
            const r = await apiFetch(url, { method, body: JSON.stringify(body) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSaved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>{editing ? '✏️ Edit Budget' : '📊 Add Budget Line'}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                {err && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}
                <form onSubmit={submit}>
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Category <span className="required">*</span></label>
                            {editing ? (
                                <input name="category" value={form.category} onChange={h} required />
                            ) : (
                                <select name="category" value={form.category} onChange={h} required>
                                    <option value="">Select category…</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="__custom">Custom…</option>
                                </select>
                            )}
                        </div>
                        {form.category === '__custom' && (
                            <div className="form-group" style={{ gridColumn: '1/-1' }}>
                                <label>Custom Category</label>
                                <input name="category" value="" onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Enter category name" required />
                            </div>
                        )}
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Budgeted Amount (KES) <span className="required">*</span></label>
                            <input type="number" name="budgetedAmount" step="1" min="0" value={form.budgetedAmount} onChange={h} required placeholder="e.g. 50000" />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? '✓ Update' : '+ Add Budget'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const BudgetTracker = () => {
    const [period,   setPeriod]    = useState(new Date().toISOString().substring(0, 7));
    const [data,     setData]      = useState(null);
    const [loading,  setLoading]   = useState(true);
    const [modal,    setModal]     = useState(null); // null | true | {editing}
    const [toast,    setToast]     = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        apiFetch(`/api/budgets/vs-actuals?period=${period}`).then(r => r.json()).then(budgetData => {
            setData(budgetData);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const deleteBudgetRequest = (id) => {
        setConfirmDelete(id);
    };

    const executeDeleteBudget = async () => {
        const id = confirmDelete;
        setConfirmDelete(null);
        if (!id) return;
        try {
            const r = await apiFetch(`/api/budgets/${id}`, { method: 'DELETE' });
            if (!r.ok) {
                const d = await r.json();
                throw new Error(d.error || 'Server error');
            }
            showToast('Budget line deleted.');
            load();
        } catch (e) { showToast(e.message, 'error'); }
    };

    const navigateMonth = (dir) => {
        const d = new Date(period + '-01');
        d.setMonth(d.getMonth() + dir);
        setPeriod(d.toISOString().substring(0, 7));
    };

    const chartData = data?.comparison?.map(c => ({
        name: c.category.length > 12 ? c.category.substring(0, 12) + '…' : c.category,
        Budgeted: c.budgeted,
        Actual: c.actual,
    })) || [];

    const barColors = { Budgeted: '#6366f1', Actual: '#10b981' };

    return (
        <div>
            <div className="section-header">
                <h2>📊 Budget vs Actuals</h2>
                <button className="btn btn-primary" onClick={() => setModal(true)}>+ Add Budget Line</button>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {/* Period nav */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
                    <button className="btn btn-ghost" onClick={() => navigateMonth(-1)}>◀</button>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, minWidth: 120, textAlign: 'center' }}>
                        {new Date(period + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                    </span>
                    <button className="btn btn-ghost" onClick={() => navigateMonth(1)}>▶</button>
                </div>
            </div>

            {loading ? (
                <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Loading…</p></div>
            ) : (
                <>
                    {/* Summary cards */}
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
                        {[
                            { label: 'Total Budgeted', value: `KES ${fmt(data?.totalBudgeted || 0)}`, accent: 'var(--accent)' },
                            { label: 'Total Spent', value: `KES ${fmt(data?.totalActual || 0)}`, accent: data?.totalActual > data?.totalBudgeted ? 'var(--danger)' : 'var(--success)' },
                            { label: 'Variance', value: `KES ${fmt(data?.totalVariance || 0)}`, accent: (data?.totalVariance || 0) >= 0 ? 'var(--success)' : 'var(--danger)' },
                        ].map(c => (
                            <div key={c.label} className="stat-card" style={{ borderColor: c.accent }}>
                                <div className="label">{c.label}</div>
                                <div className="value" style={{ color: c.accent }}>{c.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    {chartData.length > 0 && (
                        <div className="card" style={{ marginBottom: '1.25rem' }}>
                            <h3 style={{ marginBottom: '1rem' }}>Budget vs Actual Comparison</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={chartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                                    <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(v) => [`KES ${fmt(v)}`, '']} contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: '0.82rem' }} />
                                    <Bar dataKey="Budgeted" fill={barColors.Budgeted} radius={[4,4,0,0]} />
                                    <Bar dataKey="Actual" fill={barColors.Actual} radius={[4,4,0,0]} />
                                </BarChart>
                            </ResponsiveContainer>
                            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                                {Object.entries(barColors).map(([k,v]) => (
                                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        <div style={{ width: 12, height: 12, borderRadius: 3, background: v }} /> {k}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    <div className="card">
                        <h3 style={{ marginBottom: '1rem' }}>Line Items</h3>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Category</th><th>Budgeted</th><th>Actual</th><th>Variance</th><th>Utilization</th><th style={{ textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!data?.comparison || data.comparison.length === 0) ? (
                                        <tr className="empty-row"><td colSpan="6">No budget lines for this period. Add one to get started!</td></tr>
                                    ) : data.comparison.map((c, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{c.category}</td>
                                            <td style={{ color: 'var(--accent)' }}>KES {fmt(c.budgeted)}</td>
                                            <td style={{ color: c.actual > c.budgeted ? 'var(--danger)' : 'var(--success)' }}>KES {fmt(c.actual)}</td>
                                            <td style={{ color: c.variance >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                {c.variance >= 0 ? '+' : '−'} KES {fmt(Math.abs(c.variance))}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ flex: 1, height: 6, background: 'var(--hover-bg)', borderRadius: 3, overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min(100, c.utilization)}%`, background: c.utilization > 100 ? 'var(--danger)' : c.utilization > 80 ? '#f59e0b' : 'var(--success)', borderRadius: 3, transition: 'width 0.3s' }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: 32 }}>{c.utilization}%</span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {c.id && (
                                                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                                                        <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                                                            onClick={() => setModal({ id: c.id, category: c.category, budgetedAmount: c.budgeted })}>✏️</button>
                                                        {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                                            <button className="btn btn-danger btn-icon" onClick={() => deleteBudgetRequest(c.id)} title="Delete">🗑</button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {modal && (
                <BudgetModal
                    period={period}
                    editing={modal !== true ? modal : null}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); load(); showToast(modal !== true ? 'Budget updated.' : 'Budget line added.'); }}
                />
            )}

            {/* ── Confirm Delete Modal ── */}
            {confirmDelete && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3>Confirm Deletion</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Are you sure you want to permanently delete this budget line?
                            <br /><br />
                            <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>This action cannot be undone.</span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-danger" onClick={executeDeleteBudget}>Yes, Delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetTracker;
