import { useState, useEffect, useCallback } from 'react';
import { apiFetch, downloadBlob, getRole, getAdminId } from '../utils/api';
import { Html5QrcodeScanner } from 'html5-qrcode';

const QRScannerModal = ({ meetingId, onCheckIn, onClose }) => {
    const [status, setStatus] = useState('Ready to scan');
    useEffect(() => {
        const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 });
        scanner.render(async (decodedText) => {
            setStatus('Verifying...');
            try {
                const r = await apiFetch(`/api/meetings/${meetingId}/check-in`, { 
                    method: 'POST', 
                    body: JSON.stringify({ membershipNumber: decodedText }) 
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setStatus(`✅ ${d.memberName} checked in!`);
                onCheckIn();
                setTimeout(() => setStatus('Scanning...'), 2000);
            } catch (e) {
                setStatus(`❌ Error: ${e.message}`);
                setTimeout(() => setStatus('Scanning...'), 3000);
            }
        }, (err) => {});
        return () => { scanner.clear().catch(e => console.warn("Scanner clear failed", e)); };
    }, [meetingId, onCheckIn]);

    return (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 450, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📸 QR Attendance Scanner</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>
                <div id="qr-reader" style={{ width: '100%', marginBottom: '1rem' }}></div>
                <div style={{ padding: '0.75rem', background: 'var(--bg)', borderRadius: 8, fontWeight: 600, color: status.includes('✅') ? 'var(--success)' : status.includes('❌') ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {status}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '1rem' }}>Point camera at member's Digital ID Card QR code</p>
            </div>
        </div>
    );
};

const CombinedMeetingModal = ({ meeting, onClose, onSaved }) => {
    const [attendance, setAttendance] = useState([]);
    const [minutes, setMinutes] = useState(meeting.minutes || '');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [showScanner, setShowScanner] = useState(false);

    const fetchAttendance = useCallback(() => {
        apiFetch(`/api/meetings/${meeting.id}/attendance`).then(r => r.json()).then(d => {
            setAttendance(d.attendance || []); setLoading(false);
        });
    }, [meeting.id]);

    useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

    const toggle = (memberId) => setAttendance(a => a.map(x => x.memberId === memberId ? { ...x, attended: !x.attended } : x));
    
    const saveAll = async () => {
        setSaving(true);
        try {
            const r1 = await apiFetch(`/api/meetings/${meeting.id}/attendance`, { method: 'PUT', body: JSON.stringify({ attendance }) });
            if (!r1.ok) throw new Error('Failed to save attendance');
            
            const r2 = await apiFetch(`/api/meetings/${meeting.id}`, { 
                method: 'PUT', 
                body: JSON.stringify({ ...meeting, minutes }) 
            });
            if (!r2.ok) throw new Error('Failed to save minutes');

            setToast({ type: 'success', msg: '✓ Minutes & Attendance saved.' });
            setTimeout(() => { setToast(null); onSaved(); }, 1500);
        } catch (e) { setToast({ type: 'error', msg: e.message }); }
        setSaving(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 900, width: '95%' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🎙️ Meeting Recorder — {meeting.title}</h2>
                        <button className="btn btn-accent" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setShowScanner(true)}>📸 Scan Attendance</button>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>
                {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}
                
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', maxHeight: '75vh', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid var(--border)', paddingRight: '1rem', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>👥 Attendance ({attendance.filter(a=>a.attended).length}/{attendance.length})</h4>
                        </div>
                        {loading ? <p>Loading members...</p> : (
                            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '4px' }}>
                                {attendance.map(a => (
                                    <div key={a.memberId} onClick={() => toggle(a.memberId)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem',
                                            background: a.attended ? 'rgba(34,197,94,0.1)' : 'var(--bg)', border: `1px solid ${a.attended ? 'var(--success)' : 'var(--border)'}`,
                                            transition: 'all 0.2s' }}>
                                        <span style={{ fontSize: '1rem' }}>{a.attended ? '✅' : '⬜'}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: a.attended ? 600 : 400 }}>{a.name}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{a.membershipNumber}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>✍️ Live Minutes</h4>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Autosaves on "Save Minutes & Attendance"</div>
                        </div>
                        <textarea 
                            style={{ flex: 1, padding: '1.25rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 10, fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.6, resize: 'none', outline: 'none' }}
                            placeholder="Type meeting minutes here... Use # for headers, - for bullets"
                            value={minutes}
                            onChange={e => setMinutes(e.target.value)}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                    <button className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }} onClick={saveAll} disabled={saving || loading}>
                        {saving ? '⏳ Saving Records...' : '🏁 Save & Complete Meeting'}
                    </button>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel / Close</button>
                </div>

                {showScanner && <QRScannerModal meetingId={meeting.id} onCheckIn={fetchAttendance} onClose={() => setShowScanner(false)} />}
            </div>
        </div>
    );
};

const MeetingModal = ({ meeting, onClose, onSaved }) => {
    const [form, setForm] = useState(meeting ? {
        title: meeting.title, date: meeting.date?.slice(0,16), location: meeting.location || '', 
        notes: meeting.notes || '', agenda: meeting.agenda || '', minutes: meeting.minutes || '',
        meetingType: meeting.meetingType || 'regular', isMandatory: !!meeting.isMandatory
    } : { title: '', date: '', location: '', notes: '', agenda: '', minutes: '', meetingType: 'regular', isMandatory: false });
    const [err, setErr]  = useState('');
    const [busy, setBusy] = useState(false);
    const h = e => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm(f => ({ ...f, [e.target.name]: val }));
    };

    const submit = async (e) => {
        e.preventDefault(); setErr(''); setBusy(true);
        try {
            const url    = meeting ? `/api/meetings/${meeting.id}` : '/api/meetings';
            const method = meeting ? 'PUT' : 'POST';
            const r = await apiFetch(url, { method, body: JSON.stringify(form) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSaved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{meeting ? '✏️ Edit Meeting' : '📅 New Meeting'}</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>
                {err && <div className="toast toast-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}
                <form onSubmit={submit}>
                    <div className="form-grid">
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Title <span className="required">*</span></label>
                            <input name="title" value={form.title} onChange={h} required placeholder="e.g. Monthly LLUCG Meeting" />
                        </div>
                        <div className="form-group">
                            <label>Date & Time <span className="required">*</span></label>
                            <input type="datetime-local" name="date" value={form.date} onChange={h} required />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input name="location" value={form.location} onChange={h} placeholder="e.g. Nairobi CBD, Zoom link…" />
                        </div>
                        <div className="form-group">
                            <label>Type</label>
                            <select name="meetingType" value={form.meetingType} onChange={h}>
                                <option value="regular">Regular Meeting</option>
                                <option value="agm">AGM (Annual General)</option>
                                <option value="special">Special Meeting</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <input type="checkbox" name="isMandatory" checked={form.isMandatory} onChange={h} id="mandatory-chk" />
                            <label htmlFor="mandatory-chk" style={{ marginBottom: 0, cursor: 'pointer' }}>Mandatory (Auto-Penalty if absent)</label>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Agenda</label>
                            <textarea name="agenda" value={form.agenda} onChange={h} placeholder="Meeting agenda items…" rows="3"></textarea>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1/-1' }}>
                            <label>Minutes</label>
                            <textarea name="minutes" value={form.minutes} onChange={h} placeholder="Official minutes…" rows="4"></textarea>
                            {form.isMandatory && <p style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: '0.2rem' }}>💡 Saving minutes for a mandatory meeting will trigger absentee penalties.</p>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : meeting ? '✓ Update' : '+ Create Meeting'}</button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AttendanceModal = ({ meeting, onClose }) => {
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [toast,   setToast]   = useState(null);

    useEffect(() => {
        apiFetch(`/api/meetings/${meeting.id}/attendance`).then(r => r.json()).then(d => {
            setAttendance(d.attendance || []); setLoading(false);
        });
    }, [meeting.id]);

    const toggle = (memberId) => setAttendance(a => a.map(x => x.memberId === memberId ? { ...x, attended: !x.attended } : x));
    const markAll = () => setAttendance(a => a.map(x => ({ ...x, attended: true })));

    const save = async () => {
        setSaving(true);
        try {
            const r = await apiFetch(`/api/meetings/${meeting.id}/attendance`, { method: 'PUT', body: JSON.stringify({ attendance }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setToast({ type: 'success', msg: '✓ Attendance saved.' });
            setTimeout(() => setToast(null), 2000);
        } catch (e) { setToast({ type: 'error', msg: e.message }); }
        setSaving(false);
    };

    const attCount = attendance.filter(a => a.attended).length;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📋 Attendance — {meeting.title}</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {attCount} / {attendance.length} present {meeting.isMandatory ? ' (Mandated)' : ''}
                    </p>
                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={markAll}>Mark All Present</button>
                </div>
                {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '0.75rem' }}>{toast.msg}</div>}
                {loading ? <p>Loading…</p> : (
                    <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {attendance.map(a => (
                            <div key={a.memberId} onClick={() => toggle(a.memberId)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, cursor: 'pointer',
                                    background: a.attended ? 'rgba(21,128,61,0.12)' : 'var(--card-bg)', border: `1px solid ${a.attended ? 'rgba(21,128,61,0.3)' : 'var(--border)'}` }}>
                                <span style={{ fontSize: '1.1rem' }}>{a.attended ? '✅' : '⬜'}</span>
                                <span style={{ fontWeight: a.attended ? 600 : 400, color: a.attended ? 'var(--success)' : 'var(--text-primary)' }}>{a.memberName}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                    <button className="btn btn-primary" onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : '✓ Save Attendance'}</button>
                    <button className="btn btn-ghost" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

const ResolutionsModal = ({ meeting, onClose }) => {
    const [resolutions, setResolutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ resolution: '', proposedBy: '' });
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null);
    const [confirmDeleteRes, setConfirmDeleteRes] = useState(null);

    const loadData = useCallback(() => {
        apiFetch(`/api/meetings/${meeting.id}/resolutions`)
            .then(r => r.json())
            .then(d => { setResolutions(d.resolutions || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [meeting.id]);
    useEffect(() => { loadData(); }, [loadData]);

    const showMsg = (msg, type='success') => { setToast({msg, type}); setTimeout(() => setToast(null), 3000); };

    const add = async (e) => {
        e.preventDefault(); setBusy(true);
        try {
            const r = await apiFetch(`/api/meetings/${meeting.id}/resolutions`, { method: 'POST', body: JSON.stringify(form) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setForm({ resolution: '', proposedBy: '' });
            loadData();
            showMsg('Motion tabled.');
        } catch(e) { showMsg(e.message, 'error'); }
        setBusy(false);
    };

    const updateStatus = async (rId, status) => {
        try {
            await apiFetch(`/api/meetings/${meeting.id}/resolutions/${rId}`, { method: 'PUT', body: JSON.stringify({ status }) });
            loadData(); showMsg('Status updated.');
        } catch(e) { showMsg(e.message, 'error'); }
    };

    const handleDeleteResRequest = (rId) => {
        setConfirmDeleteRes(rId);
    };

    const executeDeleteRes = async () => {
        const rId = confirmDeleteRes;
        setConfirmDeleteRes(null);
        if (!rId) return;
        try {
            await apiFetch(`/api/meetings/${meeting.id}/resolutions/${rId}`, { method: 'DELETE' });
            loadData(); showMsg('Resolution deleted.');
        } catch(e) { showMsg(e.message, 'error'); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 650 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>⚖️ AGM Resolutions — {meeting.title}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
                {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}
                
                <form onSubmit={add} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg)', borderRadius: 8 }}>
                    <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                        <label>Resolution Motion <span style={{color:'var(--danger)'}}>*</span></label>
                        <textarea name="resolution" value={form.resolution} onChange={e=>setForm({...form, resolution:e.target.value})} required placeholder="e.g. Approve 2024 budget" rows="2" />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Proposed By <span style={{color:'var(--danger)'}}>*</span></label>
                            <input name="proposedBy" value={form.proposedBy} onChange={e=>setForm({...form, proposedBy:e.target.value})} required placeholder="Member name" />
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '...' : '+ Table Motion'}</button>
                    </div>
                </form>

                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>TABLED RESOLUTIONS</h4>
                {loading ? <p>Loading...</p> : resolutions.length === 0 ? <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>No resolutions recorded.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 350, overflowY: 'auto' }}>
                        {resolutions.map(r => (
                            <div key={r.id} style={{ padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, 
                                        background: r.status==='passed'?'rgba(21,128,61,0.1)':r.status==='rejected'?'rgba(220,38,38,0.1)':'rgba(99,102,241,0.1)',
                                        color: r.status==='passed'?'var(--success)':r.status==='rejected'?'var(--danger)':'var(--accent)' }}>
                                        {r.status.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Proposed by: {r.proposedBy}</span>
                                </div>
                                <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 500 }}>{r.resolution}</p>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: r.status==='passed'?'var(--success)':'' }} onClick={() => updateStatus(r.id, 'passed')}>Pass</button>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: r.status==='rejected'?'var(--danger)':'' }} onClick={() => updateStatus(r.id, 'rejected')}>Reject</button>
                                    <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: r.status==='tabled'?'var(--accent)':'' }} onClick={() => updateStatus(r.id, 'tabled')}>Table (Defer)</button>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
                                        {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                                            <button className="btn btn-danger btn-icon" style={{ padding: '0.2rem' }} onClick={() => handleDeleteResRequest(r.id)}>🗑</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Confirm Delete Resolution Modal ── */}
                {confirmDeleteRes && (
                    <div className="modal-overlay" style={{ zIndex: 1200 }}>
                        <div className="modal-box" style={{ maxWidth: 400 }}>
                            <div className="modal-header">
                                <h3>Confirm Deletion</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDeleteRes(null)}>✕</button>
                            </div>
                            <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                Are you sure you want to permanently delete this resolution?
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="btn btn-danger" onClick={executeDeleteRes}>Yes, Delete</button>
                                <button className="btn btn-ghost" onClick={() => setConfirmDeleteRes(null)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const MeetingQRModal = ({ meeting, onClose }) => {
    // Relative path makes the QR code portable across different domains/IPs
    const qrUrl = `/api/meetings/checkin/${meeting.id}`;
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qrUrl)}&color=63-66-f1&bgcolor=ffffff`;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
            <div className="modal-box" style={{ maxWidth: 450, textAlign: 'center', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 style={{ margin: 0 }}>🤳 Scan to Check-in</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>
                
                <div style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '24px', display: 'inline-block', margin: '2rem 0', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0' }}>
                    <img src={qrImg} alt="Attendance QR" style={{ width: 280, height: 280, display: 'block' }} />
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{meeting.title}</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0 }}>{new Date(meeting.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>

                <div style={{ background: 'var(--accent-dim)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}>
                    <div style={{ fontSize: '1.5rem' }}>📱</div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600, lineHeight: 1.4 }}>
                        Members: Open your portal and tap the <strong>"Check-in"</strong> button to scan this code.
                    </p>
                </div>
            </div>
        </div>
    );
};

const Meetings = () => {
    const [meetings, setMeetings] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [modal,    setModal]    = useState(null); // null | 'new' | {meeting}
    const [attModal, setAttModal] = useState(null);
    const [resolutionsModal, setResolutionsModal] = useState(null);
    const [qrModal, setQrModal] = useState(null);
    const [toast,    setToast]    = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        apiFetch('/api/meetings').then(r => r.json()).then(d => { setMeetings(d.meetings || []); setLoading(false); });
    }, []);
    useEffect(() => { load(); }, [load]);

    const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

    const deleteMeetingRequest = (id) => {
        setConfirmDelete(id);
    };

    const executeDeleteMeeting = async () => {
        const id = confirmDelete;
        setConfirmDelete(null);
        if (!id) return;
        try {
            await apiFetch(`/api/meetings/${id}`, { method: 'DELETE' }); load(); showToast('Meeting deleted.');
        } catch (e) { showToast(e.message, 'error'); }
    };



    const upcoming = meetings.filter(m => new Date(m.date) >= new Date());
    const past     = meetings.filter(m => new Date(m.date) < new Date());

    const MeetingCard = ({ m }) => {
        const isPast   = new Date(m.date) < new Date();
        const mDate    = new Date(m.date).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
        const mTime    = new Date(m.date).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
        return (
            <div className="card card-highlight" style={{ marginBottom: '0.75rem', opacity: isPast ? 0.75 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                            <span style={{ fontSize: '1.1rem' }}>{isPast ? '📁' : '📅'}</span>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>{m.title}</h3>
                            {!isPast && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>UPCOMING</span>}
                        </div>
                        <p style={{ margin: '0 0 0.2rem', fontSize: '0.83rem', color: 'var(--text-primary)' }}>📆 {mDate} at {mTime}</p>
                        {m.location && <p style={{ margin: '0 0 0.2rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>📍 {m.location}</p>}
                        {m.notes    && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>📝 {m.notes}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: isPast ? '0.5rem' : 0 }}>
                        <button className="btn btn-accent" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontWeight: 700 }} onClick={() => setAttModal(m)}>📝 Record Minutes & Attendance</button>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }} onClick={() => setResolutionsModal(m)}>⚖️ Resolutions</button>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }} onClick={() => downloadBlob(`/api/meetings/${m.id}/minutes.pdf`, `Minutes_${m.id}.pdf`)}>📄 Minutes</button>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }} onClick={() => setQrModal(m)}>📱 Attendance QR</button>
                        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }} onClick={() => setModal(m)}>✏️</button>
                        {['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary'].includes(getRole()) && (
                            <button className="btn btn-danger btn-icon" onClick={() => deleteMeetingRequest(m.id)}>🗑</button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className="section-header">
                <h2>📅 Meeting Scheduler</h2>
                <button className="btn btn-primary" onClick={() => setModal('new')}>+ New Meeting</button>
            </div>

            {toast && <div className={`toast toast-${toast.type}`} style={{ marginBottom: '1rem' }}>{toast.msg}</div>}

            {loading ? <div className="card"><p style={{ color: 'var(--text-secondary)' }}>Loading…</p></div> : (
                <>
                    {upcoming.length > 0 && (
                        <>
                            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Upcoming ({upcoming.length})</h3>
                            {upcoming.map(m => <MeetingCard key={m.id} m={m} />)}
                        </>
                    )}
                    {past.length > 0 && (
                        <>
                            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.75rem', marginTop: '1.5rem', textTransform: 'uppercase' }}>Past ({past.length})</h3>
                            {past.map(m => <MeetingCard key={m.id} m={m} />)}
                        </>
                    )}
                    {meetings.length === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📅</div>
                            <p>No meetings scheduled yet. Create your first meeting!</p>
                        </div>
                    )}
                </>
            )}

            {modal && <MeetingModal meeting={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); showToast('Meeting saved.'); }} />}
            {attModal && <CombinedMeetingModal meeting={attModal} onClose={() => setAttModal(null)} onSaved={() => { setAttModal(null); load(); }} />}
            {resolutionsModal && <ResolutionsModal meeting={resolutionsModal} onClose={() => setResolutionsModal(null)} />}
            {qrModal && <MeetingQRModal meeting={qrModal} onClose={() => setQrModal(null)} />}
            
            {/* ── Confirm Delete Meeting Modal ── */}
            {confirmDelete && (
                <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="modal-box" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3>Confirm Deletion</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
                        </div>
                        <p style={{ marginTop: '1rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Are you sure you want to permanently delete this meeting?
                            <br /><br />
                            <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>All attendance records and resolutions tied to this meeting will be lost.</span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button className="btn btn-danger" onClick={executeDeleteMeeting}>Yes, Delete</button>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Meetings;
