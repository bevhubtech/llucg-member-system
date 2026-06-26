import { useState, useEffect, useRef, useMemo } from 'react';
import { apiFetch, getRole, getAdminId, downloadBlob } from '../utils/api';
import { FileText, Trash2, CheckCircle, Clock } from 'lucide-react';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, 
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';

const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB') : '—';
const fmtMoney = (n)   => `KES ${Number(n || 0).toLocaleString('en-KE')}`;

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#8b5cf6', '#06b6d4'];

const Expenses = () => {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [fundLiquidity, setFundLiquidity] = useState(null);
    const fileRef = useRef(null);

    // Search/Sort/Pagination State
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [sortField, setSortField] = useState('expenseDate');
    const [sortOrder, setSortOrder] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage] = useState(10);

    const emptyForm = { category: 'Meetings', amount: '', description: '', recipient: '', expenseDate: new Date().toISOString().split('T')[0], fundingSource: 'Institutional Reserves' };
    const [form, setForm] = useState(emptyForm);

    const showMsg = (msg, type = 'success') => { setToast({msg, type}); setTimeout(() => setToast(null), 3000); };

    const loadExpenses = () => {
        apiFetch('/api/expenses').then(r => r.json()).then(d => { setExpenses(d.expenses || []); setLoading(false); }).catch(() => setLoading(false));
    };
    
    useEffect(() => {
        if (showForm) {
            apiFetch(`/api/reports/savings-summary`).then(r => r.json()).then(d => {
                // Map the specific fund balance
                const b = d.fundBreakdown || {};
                const source = form.fundingSource;
                if (source === 'Member Savings') setFundLiquidity(b.savings);
                else if (source === 'Welfare Fund') setFundLiquidity(b.welfare);
                else if (source === 'Institutional Reserves') setFundLiquidity(b.reserves);
                else setFundLiquidity(d.totalGroupBalance);
            });
        }
    }, [showForm, form.fundingSource]);

    useEffect(loadExpenses, []);

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        const data = new FormData();
        data.append('category', form.category);
        data.append('amount', form.amount);
        data.append('description', form.description);
        data.append('recipient', form.recipient);
        data.append('expenseDate', form.expenseDate);
        data.append('fundingSource', form.fundingSource);
        if (fileRef.current?.files[0]) data.append('receipt', fileRef.current.files[0]);

        try {
            const res = await apiFetch('/api/expenses', { method: 'POST', body: data });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg('Expense successfully logged.');
            setShowForm(false); loadExpenses();
        } catch (err) { showMsg(err.message, 'error'); }
        setSaving(false);
    };

    const handleApprove = async (id) => {
        try {
            const res = await apiFetch(`/api/expenses/${id}/approve`, { method: 'PUT' });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg('Approval signature recorded.');
            loadExpenses();
        } catch (err) { showMsg(err.message, 'error'); }
    };

    const executeDelete = async () => {
        const id = confirmDelete;
        setConfirmDelete(null);
        if (!id) return;
        try {
            const res = await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error);
            showMsg('Expense deleted.');
            loadExpenses();
        } catch (err) { showMsg(err.message, 'error'); }
    };

    // Analytics Logic
    const analyticsData = useMemo(() => {
        const categories = {};
        const monthly = {};

        expenses.forEach(e => {
            categories[e.category] = (categories[e.category] || 0) + e.amount;
            const month = new Date(e.expenseDate).toLocaleString('default', { month: 'short' });
            monthly[month] = (monthly[month] || 0) + e.amount;
        });

        const pie = Object.keys(categories).map(k => ({ name: k, value: categories[k] }));
        const bar = Object.keys(monthly).map(k => ({ name: k, amount: monthly[k] }));

        return { pie, bar };
    }, [expenses]);

    // Filtered/Sorted/Paginated Data
    const filtered = expenses.filter(e => {
        const matchesSearch = e.description?.toLowerCase().includes(search.toLowerCase()) || e.recipient?.toLowerCase().includes(search.toLowerCase());
        const matchesCat = categoryFilter === 'All' || e.category === categoryFilter;
        return matchesSearch && matchesCat;
    }).sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
    const totalPages = Math.ceil(filtered.length / perPage);

    const toggleSort = (f) => {
        if (sortField === f) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortField(f); setSortOrder('asc'); }
    };

    return (
        <div>
            <div className="section-header">
                <h2>📊 Expense Analytics & Tracker</h2>
                <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setShowForm(true); }}>
                    + Log Expense
                </button>
            </div>
            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {/* Analytics Dashboard */}
            <div className="grid grid-2" style={{ marginBottom: '2rem', gap: '1.5rem' }}>
                <div className="card" style={{ height: '300px' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Spending by Category</h3>
                    <ResponsiveContainer width="100%" height="85%">
                        <PieChart>
                            <Pie data={analyticsData.pie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                {analyticsData.pie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value) => fmtMoney(value)} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="card" style={{ height: '300px' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Monthly Outflow Trend</h3>
                    <ResponsiveContainer width="100%" height="85%">
                        <BarChart data={analyticsData.bar}>
                            <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `KES ${v/1000}k`} />
                            <Tooltip formatter={(value) => fmtMoney(value)} cursor={{fill: 'var(--hover-bg)'}} />
                            <Bar dataKey="amount" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <input style={{ flex: 1, minWidth: 200 }} placeholder="🔍 Search description or recipient…" value={search} onChange={e => setSearch(e.target.value)} />
                    <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 180 }}>
                        <option value="All">All Categories</option>
                        {['Meetings', 'ICT', 'Office', 'Travel', 'Staff', 'Dividends', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* Expenses Table */}
            <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th onClick={() => toggleSort('expenseDate')} style={{ cursor: 'pointer' }}>Date {sortField==='expenseDate'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th>Category</th>
                                <th onClick={() => toggleSort('amount')} style={{ cursor: 'pointer' }}>Amount {sortField==='amount'&&(sortOrder==='asc'?'▲':'▼')}</th>
                                <th>Recipient</th>
                                <th>Source</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Loading…</td></tr> : 
                             paginated.length === 0 ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No expenses found.</td></tr> : 
                             paginated.map(e => (
                                <tr key={e.id}>
                                    <td className="td-muted">{fmtDate(e.expenseDate)}</td>
                                    <td><span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 4, background: 'var(--hover-bg)' }}>{e.category}</span></td>
                                    <td style={{ fontWeight: 700 }}>{fmtMoney(e.amount)}</td>
                                    <td style={{ fontSize: '0.85rem' }}>{e.recipient}</td>
                                    <td><span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{e.fundingSource || 'Reserves'}</span></td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{e.description}</td>
                                     <td>
                                        {(() => {
                                            const approvers = [e.approver1_name, e.approver2_name, e.approver3_name].filter(Boolean);
                                            const count = approvers.length;
                                            if (e.status === 'approved') return <span className="badge badge-success" title={`Approved by: ${approvers.join(', ')}`}><CheckCircle size={12} style={{marginRight:4}}/> Fully Approved</span>;
                                            if (count > 0) return <span className="badge badge-info" title={`Signed by: ${approvers.join(', ')}`}><Clock size={12} style={{marginRight:4}}/> Partially Signed ({count}/3)</span>;
                                            return <span className="badge badge-warning"><Clock size={12} style={{marginRight:4}}/> Awaiting Approval</span>;
                                        })()}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                            {e.receiptFilename && <button className="btn btn-ghost btn-icon" title="View Receipt" onClick={() => downloadBlob(`/api/expenses/${e.id}/receipt`, `receipt_${e.id}.pdf`)}><FileText size={16}/></button>}
                                            {(() => {
                                                const adminId = parseInt(getAdminId());
                                                const hasSigned = [e.approver1_id, e.approver2_id, e.approver3_id].includes(adminId);
                                                const count = [e.approver1_id, e.approver2_id, e.approver3_id].filter(Boolean).length;
                                                
                                                if (e.status === 'approved') return <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 800 }}>Verified</span>;
                                                if (hasSigned) return <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Signed</span>;
                                                if (getRole() === 'staff') return null;
                                                
                                                return (
                                                    <button 
                                                        className="btn btn-primary" 
                                                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }} 
                                                        onClick={() => handleApprove(e.id)}
                                                    >
                                                        {count === 0 ? 'Sign as 1st' : count === 1 ? 'Sign as 2nd' : 'Final Approval'}
                                                    </button>
                                                );
                                            })()}
                                            {['superadmin', 'admin'].includes(getRole()) && <button className="btn btn-danger btn-icon" title="Void Expense" onClick={() => setConfirmDelete(e.id)}><Trash2 size={16}/></button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="pagination" style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                        <button className="btn btn-ghost" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
                        <span style={{ fontSize: '0.85rem' }}>Page {currentPage} of {totalPages}</span>
                        <button className="btn btn-ghost" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
                    </div>
                )}
            </div>

            {/* Overlays */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>Log New Expense</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}>✕</button></div>
                        <form onSubmit={handleSave} className="form-grid">
                            <div className="form-group"><label>Category</label><select name="category" value={form.category} onChange={handleChange}>{['Meetings', 'ICT', 'Office', 'Travel', 'Staff', 'Dividends', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div className="form-group"><label>Amount (KES)</label><input type="number" name="amount" step="1" value={form.amount} onChange={handleChange} required /></div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Recipient</label><input name="recipient" value={form.recipient} onChange={handleChange} required /></div>
                            
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>Funding Source <span className="required">*</span></label>
                                <select name="fundingSource" value={form.fundingSource} onChange={handleChange} required>
                                    <option value="Member Savings">Member Savings (General Pool)</option>
                                    <option value="Welfare Fund">Welfare Fund</option>
                                    <option value="Institutional Reserves">Institutional Reserves (Fines/Fees)</option>
                                </select>
                                {fundLiquidity !== null && (
                                    <div style={{ fontSize: '0.7rem', marginTop: '0.4rem', color: form.amount > fundLiquidity ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                                        Available in {form.fundingSource}: KES {Number(fundLiquidity).toLocaleString()}
                                    </div>
                                )}
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Description</label><textarea name="description" value={form.description} onChange={handleChange} rows="3" /></div>
                            <div className="form-group"><label>Date</label><input type="date" name="expenseDate" value={form.expenseDate} onChange={handleChange} required /></div>
                            <div className="form-group"><label>Receipt Document</label><input type="file" ref={fileRef} accept=".pdf,image/*" /></div>
                            <button 
                                type="submit" 
                                className="btn btn-primary" 
                                style={{ gridColumn: 'span 2', marginTop: '1rem' }} 
                                disabled={saving || (fundLiquidity !== null && form.amount > fundLiquidity)}
                            >
                                {saving ? 'Uploading…' : (fundLiquidity !== null && form.amount > fundLiquidity) ? '⚠️ Insufficient Funds' : 'Submit Expense'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header"><h3>Confirm Delete</h3><button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button></div>
                        <p style={{ margin: '1rem 0 1.5rem' }}>Are you sure you want to delete this expense record?</p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-danger" onClick={executeDelete}>Delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Expenses;
