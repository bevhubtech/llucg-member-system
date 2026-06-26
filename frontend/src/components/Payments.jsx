import { useState, useEffect } from 'react';
import { apiFetch, downloadBlob, getRole, getAdminId } from '../utils/api';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Payments = () => {
  const [members,   setMembers]   = useState([]);
  const [payments,  setPayments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [submitting,setSubmitting]= useState(false);
  const [toast,     setToast]     = useState(null);
  const [lastSaved, setLastSaved] = useState(null); // id of last recorded payment
  const [confirmDelete, setConfirmDelete] = useState(null); // payment id for modal

  const emptyForm = {
    memberId: '', 
    saccoAmount: '', 
    personalAmount: '',
    loanId: '',
    penaltyId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    reference: '', note: '', recordedBy: ''
  };
  const [form, setForm] = useState(emptyForm);
  
  // Universal Gateway additions
  const [paymentType, setPaymentType] = useState('savings'); // 'savings', 'loan', 'penalty', 'registration_fee'
  const [settings, setSettings] = useState({});
  const [obligations, setObligations] = useState({ loans: [], penalties: [] });
  const [loadingObligations, setLoadingObligations] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = () => {
    Promise.all([
      apiFetch('/api/members').then(r => r.json()),
      apiFetch('/api/payments').then(r => r.json()),
      apiFetch('/api/settings').then(r => r.json()),
    ]).then(([mData, pData, sData]) => {
      setMembers(mData.members  || []);
      setPayments(pData.payments || []);
      setSettings(sData.settings || {});
      setLoading(false);
    }).catch(() => setLoading(false));
}

  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    
    // Fetch obligations if member changes
    if (e.target.name === 'memberId') {
      const mid = e.target.value;
      if (!mid) {
        setObligations({ loans: [], penalties: [] });
      } else {
        setLoadingObligations(true);
        apiFetch(`/api/members/${mid}/obligations`)
          .then(async r => {
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to fetch obligations');
            setObligations(data);
            setLoadingObligations(false);
          })
          .catch(err => {
            showToast(err.message, 'error');
            setLoadingObligations(false);
          });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.memberId || !form.paymentDate)
      return showToast('Member and Date are required.', 'error');
      
    setSubmitting(true);
    
    try {
      if (paymentType === 'savings') {
        const sacco = Number(form.saccoAmount || 0);
        const personal = Number(form.personalAmount || 0);
        
        if (sacco <= 0 && personal <= 0) {
          throw new Error('At least one savings amount is required.');
        }

        // Record SACCO Contribution
        if (sacco > 0) {
          await apiFetch('/api/payments', {
            method: 'POST',
            body: JSON.stringify({
              memberId: form.memberId,
              amount: sacco,
              paymentDate: form.paymentDate,
              reference: form.reference,
              walletType: 'SACCO Savings',
              note: form.note || 'Monthly SACCO Contribution'
            })
          }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'SACCO record failed'); } return r.json(); });
        }

        // Record Personal Savings
        if (personal > 0) {
          await apiFetch('/api/payments', {
            method: 'POST',
            body: JSON.stringify({
              memberId: form.memberId,
              amount: personal,
              paymentDate: form.paymentDate,
              reference: form.reference,
              walletType: 'Personal Savings',
              note: form.note || 'Personal Savings Deposit'
            })
          }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Personal record failed'); } return r.json(); });
        }
        
        showToast('✅ Savings recorded successfully.');
      } 
      else if (paymentType === 'loan') {
        if (!form.loanId || Number(form.amount || 0) <= 0) throw new Error('Select a loan and enter a valid amount.');
        
        const data = await apiFetch(`/api/loans/${form.loanId}/repay`, {
          method: 'POST',
          body: JSON.stringify({ amount: form.amount, paidDate: form.paymentDate, reference: form.reference })
        }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Loan repayment failed'); } return r.json(); });
        
        showToast('✅ Loan repayment recorded successfully.');
      } 
      else if (paymentType === 'penalty') {
        if (!form.penaltyId) throw new Error('Select a penalty to clear.');
        
        await apiFetch(`/api/penalties/${form.penaltyId}/pay`, {
          method: 'PUT',
          body: JSON.stringify({ reference: form.reference })
        }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Penalty payment failed'); } return r.json(); });
        
        showToast('✅ Penalty/Fee marked as paid.');
      }
      else if (paymentType === 'welfare') {
        const amount = Number(form.amount || settings.welfare_contribution_amount || 100);
        await apiFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            memberId: form.memberId,
            amount: amount,
            paymentDate: form.paymentDate,
            reference: form.reference,
            walletType: 'Welfare Fund',
            note: form.note || 'Welfare Contribution'
          })
        }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Welfare record failed'); } return r.json(); });
        showToast('✅ Welfare contribution recorded.');
      }
      else if (paymentType === 'monthly_contribution') {
        const welfare = Number(settings.welfare_contribution_amount || 100);
        const savings = Number(settings.contribution_target || 1000); // Dynamic base savings
        const total = savings + welfare;
        
        await apiFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            memberId: form.memberId,
            amount: total,
            paymentDate: form.paymentDate,
            reference: form.reference,
            walletType: 'Monthly Contribution',
            note: form.note || `Total: ${total} (Savings: ${savings}, Welfare: ${welfare})`,
            splits: [
              { type: 'SAVINGS', amount: savings, description: 'Monthly Savings' },
              { type: 'WELFARE', amount: welfare, description: 'Monthly Welfare' }
            ]
          })
        }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Monthly contribution failed'); } return r.json(); });
        showToast(`✅ Standard contribution of ${total.toLocaleString()} recorded and split.`);
      }
      else if (paymentType === 'registration_fee') {
        const regAmount = Number(form.amount || settings.registration_fee_amount || 500);
        if (regAmount <= 0) throw new Error('Valid registration fee amount required.');

        await apiFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            memberId: form.memberId,
            amount: regAmount,
            paymentDate: form.paymentDate,
            reference: form.reference,
            walletType: 'Registration Fee',
            note: form.note || 'Membership Registration Fee'
          })
        }).then(async r => { if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Registration recording failed'); } return r.json(); });

        showToast('✅ Registration fee recorded. Member is now fully verified.');
      }

      setForm(emptyForm);
      fetchData();
      if (form.memberId) {
        apiFetch(`/api/members/${form.memberId}/obligations`).then(r => r.json()).then(setObligations).catch(()=>{});
      }
    } catch (err) {
      showToast(err.message || 'Failed to record payment.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequest = (id) => {
    setConfirmDelete(id);
  };

  const executeDelete = async () => {
    const id = confirmDelete;
    setConfirmDelete(null);
    if (!id) return;
    try {
      showToast('Initiating API call for payment deletion...', 'success');
      await apiFetch(`/api/payments/${id}`, { method: 'DELETE' });
      showToast('Payment deleted.', 'success');
      fetchData();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div>
      <div className="section-header">
        <h2>Payments</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => downloadBlob('/api/export/payments', 'payments_list.csv')}>
                ⬇ Export CSV
            </button>
            <button className="btn btn-ghost" onClick={fetchData}>↻ Refresh</button>
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Receipt quick-access after recording */}
      {lastSaved && (
        <div style={{ background: 'var(--success-dim)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--success)' }}>Payment recorded — generate a receipt?</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem', color: 'var(--success)', borderColor: 'rgba(74,222,128,0.3)' }}
              onClick={() => downloadBlob(`/api/payments/${lastSaved}/receipt.pdf`, `receipt_${lastSaved}.pdf`)}
            >
              ⬇ Download PDF Receipt
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setLastSaved(null)}>✕</button>
          </div>
        </div>
      )}

      {/* ── Record Form ── */}
      <div className="card card-highlight" style={{ marginBottom: '1.5rem' }}>
        <h3>Universal Payment Entry</h3>
        <p className="sub">Select the type of payment to record for the member.</p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button className={`btn ${paymentType === 'monthly_contribution' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaymentType('monthly_contribution')}>✨ Standard Contribution ({Number(Number(settings.contribution_target || 1000) + Number(settings.welfare_contribution_amount || 100)).toLocaleString()})</button>
          <button className={`btn ${paymentType === 'savings' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaymentType('savings')}>💳 Savings & Contributions</button>
          <button className={`btn ${paymentType === 'welfare' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaymentType('welfare')}>🏥 Welfare Fund</button>
          <button className={`btn ${paymentType === 'loan' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaymentType('loan')}>💸 Loan Repayment</button>
          <button className={`btn ${paymentType === 'penalty' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaymentType('penalty')}>⚠️ Penalty / Fee</button>
          <button className={`btn ${paymentType === 'registration_fee' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPaymentType('registration_fee')}>📄 Registration Fee</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Member <span className="required">*</span></label>
              <select name="memberId" value={form.memberId} onChange={handleChange} required>
                <option value="">— Select member —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} · {m.phone}</option>
                ))}
              </select>
            </div>

            {loadingObligations && <div className="form-group"><label>&nbsp;</label><p style={{color: 'var(--text-secondary)'}}>Loading obligations...</p></div>}

            {paymentType === 'savings' && (
              <>
                <div className="form-group">
                  <label>SACCO Contribution (KES) <span className="required">*</span></label>
                  <input type="number" name="saccoAmount" min="0" step="1" value={form.saccoAmount} onChange={handleChange} placeholder="e.g. 1000" />
                </div>
                <div className="form-group">
                  <label>Personal Savings (KES)</label>
                  <input type="number" name="personalAmount" min="0" step="1" value={form.personalAmount} onChange={handleChange} placeholder="e.g. 500" />
                </div>
              </>
            )}

            {paymentType === 'monthly_contribution' && (
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <div style={{ background: 'var(--surface-2)', padding: '1rem', borderRadius: 8, border: '1px dashed var(--border)' }}>
                    <p style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>✨ Standard Contribution Details</p>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        This will automatically record a payment of <strong>KES {Number(Number(settings.contribution_target || 1000) + Number(settings.welfare_contribution_amount || 100)).toLocaleString()}</strong> and split it exactly as configured in your Financial Governance settings:
                        <br/><br/>
                        • <strong>KES {Number(settings.contribution_target || 1000).toLocaleString()}</strong> to SACCO Savings<br/>
                        • <strong>KES {Number(settings.welfare_contribution_amount || 100).toLocaleString()}</strong> to the Welfare Fund
                    </p>
                </div>
              </div>
            )}

            {paymentType === 'loan' && (
              <>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Active Loan <span className="required">*</span></label>
                  <select name="loanId" value={form.loanId} onChange={handleChange} required>
                    <option value="">— Select a loan to repay —</option>
                    {obligations.loans.map(l => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                  {form.memberId && obligations.loans.length === 0 && !loadingObligations && <p style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop: '0.2rem'}}>This member has no active loans.</p>}
                </div>
                <div className="form-group">
                  <label>Repayment Amount (KES) <span className="required">*</span></label>
                  <input type="number" name="amount" min="0" step="1" value={form.amount} onChange={handleChange} placeholder="e.g. 1500" required={paymentType === 'loan'} />
                </div>
              </>
            )}

            {paymentType === 'penalty' && (
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Unpaid Penalty / Pledge / Fee <span className="required">*</span></label>
                <select name="penaltyId" value={form.penaltyId} onChange={handleChange} required>
                  <option value="">— Select fee to mark as paid —</option>
                  {obligations.penalties.map(p => (
                    <option key={p.id} value={p.id}>KES {Number(p.amount).toLocaleString()} — {p.reason} (Issued: {fmtDate(p.issuedDate)})</option>
                  ))}
                </select>
                {form.memberId && (!obligations.penalties || obligations.penalties.length === 0) && !loadingObligations && (
                  <p style={{fontSize:'0.75rem', color:'var(--success)', marginTop: '0.4rem'}}>
                    ✨ Great! This member has no outstanding penalties, pledges, or fees at the moment.
                  </p>
                )}
              </div>
            )}

            {paymentType === 'registration_fee' && (
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Registration Fee Amount (KES) <span className="required">*</span></label>
                <input 
                  type="number" 
                  name="amount" 
                  value={form.amount || settings.registration_fee_amount || 500} 
                  onChange={handleChange} 
                  placeholder="e.g. 500" 
                  required={paymentType === 'registration_fee'} 
                />
                <p style={{fontSize:'0.75rem', color:'var(--text-secondary)', marginTop: '0.4rem'}}>
                  The standard fee for this group is KES {Number(settings.registration_fee_amount || 500).toLocaleString()}.
                </p>
                {form.memberId && members.find(m => m.id == form.memberId)?.registration_fee_paid === 1 && (
                  <p style={{fontSize:'0.75rem', color:'var(--success)', fontWeight: 600}}>
                    ✓ This member has already settled their registration fee.
                  </p>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Payment Date <span className="required">*</span></label>
              <input type="date" name="paymentDate" value={form.paymentDate} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>Reference / Receipt No.</label>
              <input name="reference" value={form.reference} onChange={handleChange} placeholder="M-PESA / Bank Ref" />
            </div>

            {(paymentType === 'savings' || paymentType === 'registration_fee') && (
              <>
                <div className="form-group">
                  <label>Recorded By</label>
                  <input name="recordedBy" value={form.recordedBy} onChange={handleChange} placeholder="Your name" />
                </div>
                <div className="form-group">
                  <label>Note</label>
                  <input name="note" value={form.note} onChange={handleChange} placeholder="e.g. Monthly contribution" />
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : '+ Record Payment'}
            </button>
          </div>
        </form>
      </div>


      {/* ── History Table ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Payment History</h3>
            <input 
                type="text" 
                placeholder="🔍 Search member name..." 
                style={{ maxWidth: 300, fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
                onChange={(e) => {
                    const q = e.target.value.toLowerCase();
                    setPayments(prev => prev.map(p => ({ ...p, _hidden: !p.memberName.toLowerCase().includes(q) })));
                }}
            />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount (KES)</th>
                <th>Wallet</th>
                <th>Details</th>
                <th>Date</th>
                <th>Reference</th>
                <th style={{ textAlign: 'center' }}>PDF</th>
                <th style={{ textAlign: 'center' }}>Del</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan="8">Loading...</td></tr>
              ) : payments.filter(p => !p._hidden).length === 0 ? (
                <tr className="empty-row"><td colSpan="8">No matching payments found.</td></tr>
              ) : (
                payments.filter(p => !p._hidden).map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.memberName}</strong></td>
                    <td className="td-amount">{Number(p.amount).toLocaleString()}</td>
                    <td>
                      <span className={`tx-pill ${
                        p.walletType === 'Personal Savings' ? 'tx-credit' : 
                        p.walletType === 'Loan Repayment' ? 'tx-warning' : 
                        p.walletType === 'Penalty/Fee' ? 'tx-danger' : 
                        'tx-accent'
                      }`} style={{ fontSize: '0.65rem' }}>
                        {p.walletType === 'Personal Savings' ? '👤 Personal' : 
                         p.walletType === 'Loan Repayment' ? '💸 Loan' :
                         p.walletType === 'Penalty/Fee' ? '⚠️ Penalty' :
                         p.walletType === 'SACCO Savings' ? '🏦 SACCO' :
                         p.walletType === 'Registration Fee' ? '📄 Registration' :
                         '💰 Other'}
                      </span>
                    </td>
                    <td><span style={{fontSize:'0.75rem', color:'var(--text-secondary)'}}>{p.details || '—'}</span></td>
                    <td className="td-muted td-nowrap">{fmtDate(p.paymentDate)}</td>
                    <td className="td-mono">{p.reference || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-ghost btn-icon"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                        title="Download PDF receipt"
                        onClick={() => downloadBlob(`/api/payments/${p.id}/receipt.pdf`, `receipt_${p.id}.pdf`)}
                      >
                        ⬇
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) ? (
                        <button className="btn btn-danger btn-icon" onClick={() => handleDeleteRequest(p.id)} title="Delete">🗑</button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
              Are you sure you want to permanently delete this payment?
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

export default Payments;
