import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Wallet, Calendar, Users, PiggyBank, Briefcase, Shield, Banknote,
    Bell, CreditCard, Award, Activity, Sun, Moon,
    LayoutGrid, FileText, CheckCircle, Clock, AlertTriangle,
    RefreshCw, ArrowRight, Smartphone, ChevronRight, MessageSquare, ShieldAlert,
    Paperclip, Download, Eye, FileCheck, TrendingUp, Zap, Heart, Star, LayoutDashboard,
    ShieldCheck, Handshake, PieChart as PieChartIcon, Settings as SettingsIcon,
    Trash2, Megaphone
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { memberFetch, getMemberName, getMemberToken, downloadBlob, memberDownloadBlob, memberViewBlob } from '../utils/api';
import { Html5QrcodeScanner } from 'html5-qrcode';
import logo from '../assets/logo.png';
import Communications from './Communications';
import DocumentVault from './DocumentVault';
import Notifications from './Notifications';
import Campaigns from './Campaigns';
import { motion, AnimatePresence } from 'framer-motion';

const ScannerModal = ({ onClose }) => {
    const [status, setStatus] = useState('Scanning...');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const scanner = new Html5QrcodeScanner("reader", { 
            fps: 15, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        });
        
        scanner.render(async (decodedText) => {
            if (isProcessing) return;
            setIsProcessing(true);
            setStatus('📡 Verifying Meeting...');
            
            // Haptic feedback if supported
            if (navigator.vibrate) navigator.vibrate(100);

            try {
                // Handle both full URLs and relative paths
                let path = decodedText;
                if (path.includes(window.location.origin)) {
                    path = path.replace(window.location.origin, '');
                }

                if (path.includes('/api/meetings/checkin/')) {
                    const r = await memberFetch(path);
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error || 'Check-in failed');
                    
                    setStatus(`✅ Welcome! Checked in for: ${d.meetingTitle || 'Meeting'}`);
                    setTimeout(() => onClose(), 2500);
                } else {
                    throw new Error('This is not a valid Meeting Attendance QR Code.');
                }
            } catch (e) {
                setStatus(`❌ ${e.message}`);
                setIsProcessing(false);
                // The scanner might still be running, but we show the error
                setTimeout(() => setStatus('Scanning...'), 4000);
            }
        }, (err) => {});

        return () => { 
            scanner.clear().catch(e => console.warn("Scanner cleanup failed", e)); 
        };
    }, [onClose, isProcessing]);

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 3000 }}>
            <div className="modal-box" style={{ maxWidth: 450, textAlign: 'center', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Activity className="text-accent" /> Meeting Check-in</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>
                
                <div style={{ position: 'relative', background: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: '1.5rem', minHeight: 300 }}>
                    <div id="reader" style={{ width: '100%' }}></div>
                    {isProcessing && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, backdropFilter: 'blur(4px)' }}>
                            <div className="spin" style={{ width: 40, height: 40, border: '4px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: '1rem' }}></div>
                            <span style={{ fontWeight: 700, color: '#fff' }}>Processing Check-in...</span>
                        </div>
                    )}
                </div>

                <div style={{ padding: '1.25rem', background: status.includes('✅') ? 'rgba(16,185,129,0.1)' : status.includes('❌') ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)', borderRadius: 12, transition: 'all 0.3s' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: status.includes('✅') ? 'var(--success)' : status.includes('❌') ? 'var(--danger)' : 'var(--accent)' }}>
                        {status}
                    </div>
                </div>
                
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '1.5rem', lineHeight: 1.5 }}>
                    Please point your camera at the QR code displayed by the meeting organizer. 
                    Ensure you have a stable internet connection.
                </p>
            </div>
        </div>
    );
};

const MemberPortal = () => {
    const { tab } = useParams();
    const navigate = useNavigate();
    const fmt = (v) => new Number(v || 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES' });

    const getIcon = (name, Fallback) => {
        const Icons = { CreditCard, Banknote, PiggyBank, TrendingUp, Users, Calendar, Shield, Zap, Heart, Star, LayoutDashboard, FileCheck, Award, MessageSquare, ShieldCheck, FileText, Smartphone, AlertTriangle, PieChart: PieChartIcon };
        return Icons[name] || Fallback;
    };

    const [lexicon, setLexicon] = useState({});
    const getLabel = (key, def) => lexicon[key] || def;


    const [systemSettings, setSystemSettings] = useState({});
    const [stats, setStats] = useState(null);
    const [payments, setPayments] = useState([]);
    const [loans, setLoans] = useState([]);
    const [pledges, setPledges] = useState([]);
    const [polls, setPolls] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [penalties, setPenalties] = useState([]);
    const [resolutions, setResolutions] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [guarantors, setGuarantors] = useState([]);
    const [dividends, setDividends] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [wealthHistory, setWealthHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState(() => {
        const localTheme = localStorage.getItem('theme');
        try {
            const cachedFeatures = JSON.parse(localStorage.getItem('system_features') || '{}');
            if (cachedFeatures.allow_user_theme_toggle === 'true' && localTheme) {
                return localTheme;
            }
            if (cachedFeatures.theme_light_mode !== undefined) {
                return cachedFeatures.theme_light_mode === 'true' ? 'light' : 'dark';
            }
        } catch (e) {}
        return localTheme || 'dark';
    });
    // Loan Application state
    const [loanApps, setLoanApps] = useState([]);
    const [savingsPots, setSavingsPots] = useState([]);
    const [ledger, setLedger] = useState([]);
    const [potForm, setPotForm] = useState({ name: '', targetAmount: '', deadline: '' });
    const [fundForm, setFundForm] = useState({ potId: null, amount: '', mode: 'fund' });
    const [loanForm, setLoanForm] = useState({ amount: '', tenure: 6, reason: '' });
    const [applyingLoan, setApplyingLoan] = useState(false);
    const [loanMsg, setLoanMsg] = useState(null);
    // Loan Calculator state
    const [calcAmount, setCalcAmount] = useState(50000);
    const [policyContent, setPolicyContent] = useState('');
    const [showPolicy, setShowPolicy] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(null);
    const [calcTenure, setCalcTenure] = useState(6);
    const [calcRate, setCalcRate] = useState(5);

    // MFA Challenge state
    const [mfaChallenge, setMfaChallenge] = useState(null);
    const [mfaCode, setMfaCode] = useState('');
    
    // M-Pesa Split Payments state
    const [mpesaAllocations, setMpesaAllocations] = useState([{ type: 'Share Capital', amount: '' }]);
    const [mpesaStatus, setMpesaStatus] = useState(null); // 'pending', 'completed', 'failed', null
    const [mpesaRequestId, setMpesaRequestId] = useState(null);
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [requestingMfa, setRequestingMfa] = useState(false);

    // Profile state
    const [profileEmail, setProfileEmail] = useState('');
    const [profilePhone, setProfilePhone] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState(null);
    const [beneficiaries, setBeneficiaries] = useState([]);
    const [fetchingBeneficiaries, setFetchingBeneficiaries] = useState(false);
    const [savingBeneficiary, setSavingBeneficiary] = useState(false);
    const [showBeneficiaryModal, setShowBeneficiaryModal] = useState(false);
    const [beneficiaryForm, setBeneficiaryForm] = useState({ name: '', relationship: '', phone: '', allocationPercentage: '', idNumber: '' });

    const TABS = [
        { id: 'member_dashboard', name: getLabel('member_dashboard', systemSettings?.ui_label_member_dashboard || 'Overview'), slug: 'overview', key: 'overview', icon: getIcon(systemSettings?.ui_icon_member_dashboard, LayoutDashboard) },
        { id: 'member_payments', name: getLabel('member_payments', systemSettings?.ui_label_member_payments || 'Payments'), slug: 'payments', key: 'toggle_member_payments', icon: getIcon(systemSettings?.ui_icon_member_payments, CreditCard) },
        { id: 'member_savings', name: getLabel('member_savings', systemSettings?.ui_label_member_savings || 'Savings Pots'), slug: 'savings-pots', key: 'toggle_member_savings', icon: getIcon(systemSettings?.ui_icon_member_savings, PiggyBank) },
        { id: 'member_loans', name: getLabel('member_loans', systemSettings?.ui_label_member_loans || 'Loans'), slug: 'loans', key: 'toggle_member_loans', icon: getIcon(systemSettings?.ui_icon_member_loans, Banknote) },
        { id: 'member_apply_loan', name: getLabel('member_apply_loan', systemSettings?.ui_label_member_apply_loan || 'Apply for Loan'), slug: 'apply-for-loan', key: 'toggle_member_loans', icon: getIcon(systemSettings?.ui_icon_member_apply_loan, FileCheck) },
        { id: 'member_meetings', name: getLabel('member_meetings', systemSettings?.ui_label_member_meetings || 'Meetings'), slug: 'meetings', key: 'toggle_member_meetings', icon: getIcon(systemSettings?.ui_icon_member_meetings, Calendar) },
        { id: 'member_polls', name: getLabel('member_polls', systemSettings?.ui_label_member_polls || 'Polls'), slug: 'polls', key: 'toggle_member_polls', icon: getIcon(systemSettings?.ui_icon_member_polls, PieChartIcon) },
        { id: 'member_dividends', name: getLabel('member_dividends', systemSettings?.ui_label_member_dividends || 'Dividends'), slug: 'dividends', key: 'overview', icon: getIcon(systemSettings?.ui_icon_member_dividends, Award) },
        { id: 'member_support', name: getLabel('member_support', systemSettings?.ui_label_member_support || 'Communications'), slug: 'communications', key: 'toggle_member_support', icon: getIcon(systemSettings?.ui_icon_member_support, MessageSquare) },
        { id: 'member_campaigns', name: getLabel('member_campaigns', 'Announcements'), slug: 'campaigns', key: 'toggle_member_campaigns', icon: Megaphone },
        { id: 'member_docs', name: getLabel('member_docs', systemSettings?.ui_label_member_docs || 'Group Documents'), slug: 'group-documents', key: 'toggle_member_documents', icon: getIcon(systemSettings?.ui_icon_member_docs, ShieldCheck) },
        { id: 'member_guarantors', name: getLabel('member_guarantors', systemSettings?.ui_label_member_guarantors || 'Guarantors'), slug: 'guarantors', key: 'toggle_member_guarantors', icon: getIcon(systemSettings?.ui_icon_member_guarantors, Shield), badge: guarantors.filter(g => g.status === 'pending').length },
        { id: 'member_notifications', name: getLabel('member_notifications', 'Notifications'), slug: 'notifications', key: 'toggle_member_notifications', icon: Bell, badge: notifications.filter(n => !n.isRead).length },
        { id: 'member_resolutions', name: getLabel('member_resolutions', systemSettings?.ui_label_member_resolutions || 'Resolutions'), slug: 'resolutions', key: 'toggle_member_resolutions', icon: getIcon(systemSettings?.ui_icon_member_resolutions, FileText) },
        { id: 'member_kyc', name: getLabel('member_kyc', systemSettings?.ui_label_member_kyc || 'ID & KYC'), slug: 'id-kyc', key: 'toggle_member_documents', icon: getIcon(systemSettings?.ui_icon_member_kyc, Smartphone) },
        { id: 'member_reg_fee', name: getLabel('member_reg_fee', 'Registration Fee'), slug: 'reg-fee', key: 'overview', icon: FileCheck },
        { id: 'member_welfare', name: getLabel('member_welfare', 'Welfare'), slug: 'welfare', key: 'overview', icon: Heart },
        { id: 'member_pledges', name: getLabel('member_pledges', systemSettings?.ui_label_member_pledges || 'Pledges'), slug: 'pledges', key: 'toggle_member_pledges', icon: getIcon(systemSettings?.ui_icon_member_pledges, Handshake) },
        { id: 'member_penalties', name: getLabel('member_penalties', systemSettings?.ui_label_member_penalties || 'Penalties'), slug: 'penalties', key: 'toggle_member_penalties', icon: getIcon(systemSettings?.ui_icon_member_penalties, AlertTriangle) },
        { id: 'member_profile', name: getLabel('member_profile', 'Profile Settings'), slug: 'profile', key: 'overview', icon: SettingsIcon }
    ];


    const currentTab = TABS.find(t => t.slug === tab) || TABS[0];
    const activeTab = currentTab.name;
    const isOverview = currentTab.slug === 'overview';

    // Support state
    const [memberTickets, setMemberTickets] = useState([]);
    const [ticketReplies, setTicketReplies] = useState([]);
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const [showTicketModal, setShowTicketModal] = useState(false);
    const [history, setHistory] = useState(null);
    const [ticketForm, setTicketForm] = useState({ subject: '', description: '', category: 'General' });
    const [replyText, setReplyText] = useState('');
    const [replyFile, setReplyFile] = useState(null);
    const [showKycModal, setShowKycModal] = useState(false);
    const [kycForm, setKycForm] = useState({ type: 'National ID', file: null });
    const [uploadingKyc, setUploadingKyc] = useState(false);
    const chatEndRef = useRef(null);


    useEffect(() => {
        if (selectedTicketId) {
            const fetchReplies = async () => {
                const data = await safeJson(`/api/support/tickets/${selectedTicketId}/replies`, { replies: [] });
                setTicketReplies(data.replies || []);
            };
            fetchReplies();
            const id = setInterval(fetchReplies, 10000);
            return () => clearInterval(id);
        }
    }, [selectedTicketId]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (systemSettings) {
            if (systemSettings.allow_user_theme_toggle === 'true') {
                const localTheme = localStorage.getItem('theme');
                if (localTheme) {
                    setTheme(localTheme);
                } else if (systemSettings.theme_light_mode !== undefined) {
                    setTheme(systemSettings.theme_light_mode === 'true' ? 'light' : 'dark');
                }
            } else {
                if (systemSettings.theme_light_mode !== undefined) {
                    setTheme(systemSettings.theme_light_mode === 'true' ? 'light' : 'dark');
                }
            }
        }
    }, [systemSettings]);

    // Safe fetch helper - always resolves, never throws
    const safeJson = async (url, fallback = {}) => {
        try {
            const r = await memberFetch(url);
            // If response is not JSON (e.g. HTML 404 page), return fallback
            const contentType = r.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                console.warn(`[safeJson] Non-JSON response from ${url}:`, r.status);
                return fallback;
            }
            const data = await r.json();
            // If the server returns an error object, return fallback but log it
            if (!r.ok) {
                console.warn(`[safeJson] Error from ${url}:`, data?.error || r.status);
                return fallback;
            }
            return data;
        } catch (err) {
            console.error(`[safeJson] Fetch failed for ${url}:`, err.message);
            return fallback;
        }
    };

    const fetchBeneficiaries = async () => {
        setFetchingBeneficiaries(true);
        const data = await safeJson('/api/member/me/beneficiaries', { beneficiaries: [] });
        setBeneficiaries(data.beneficiaries || []);
        setFetchingBeneficiaries(false);
    };

    const fetchAll = async () => {
        setLoading(true);
        try {
            const res = await safeJson('/api/member/me/dashboard-bulk', {});
            
            // Fetch lexicon independently to avoid blocking main UI on auth issues
            safeJson('/api/ict/lexicon', { labels: {} }).then(lex => {
                if (lex?.labels) setLexicon(lex.labels);
            }).catch(err => console.warn('Lexicon non-blocking error:', err));

            setPolicyContent(res.policy?.policy || '');
            const newFeatures = res.features || {};
            setSystemSettings(newFeatures);
            localStorage.setItem('system_features', JSON.stringify(newFeatures));
            setStats({ ...(res.member || {}), ...(res.balance || {}), ...(res.trustScore || {}) });
            setProfileEmail(res.member?.email || '');
            setProfilePhone(res.member?.phone || '');
            setPayments(res.payments || []);
            setLoans(res.loans || []);
            setPledges(res.pledges || []);
            setPolls(res.polls || []);
            setPenalties(res.penalties || []);
            setResolutions(res.resolutions || []);
            setDocuments(res.documents || []);
            setGuarantors(res.requests || []);
            setDividends(res.dividends || []);
            setNotifications(res.notifications || []);
            setWealthHistory(res.history || []);
            setMeetings(res.meetings || []);
            setSavingsPots(res.pots || []);
            setLedger(res.ledger || []);
            setLoanApps(res.applications || []);
            setBeneficiaries(res.beneficiaries || []);
            setGroupDocuments(res.vaultDocs || []);
        } catch (err) {
            console.error('Member Portal Data Error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    // --- M-Pesa Logic ---
    useEffect(() => {
        if (!mpesaRequestId || mpesaStatus !== 'pending') return;

        const interval = setInterval(async () => {
            try {
                const res = await memberFetch(`/api/mpesa/status/${mpesaRequestId}`);
                const data = await res.json();
                if (data.status === 'completed') {
                    setMpesaStatus('completed');
                    clearInterval(interval);
                    fetchAll(); // Refresh balance
                } else if (data.status === 'failed') {
                    setMpesaStatus('failed');
                    clearInterval(interval);
                }
            } catch (err) {
                console.error('Failed to poll M-Pesa status', err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [mpesaRequestId, mpesaStatus]);

    const handleMpesaSubmit = async (e) => {
        e.preventDefault();
        const total = mpesaAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
        if (total < 1) return alert("Total amount must be at least 1 KES");
        if (!mpesaPhone && !profilePhone) return alert("Please provide a valid M-Pesa phone number");

        setMpesaStatus('pending');
        try {
            const res = await memberFetch('/api/mpesa/stkpush', {
                method: 'POST',
                body: JSON.stringify({
                    phone: mpesaPhone || profilePhone,
                    totalAmount: total,
                    allocations: mpesaAllocations
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to trigger STK Push');
            
            setMpesaRequestId(data.checkoutRequestId);
        } catch (err) {
            alert(err.message);
            setMpesaStatus(null);
        }
    };
    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() && !replyFile) return;
        try {
            const formData = new FormData();
            formData.append('message', replyText);
            if (replyFile) formData.append('attachment', replyFile);

            const r = await memberFetch(`/api/support/tickets/${selectedTicketId}/replies`, {
                method: 'POST', body: formData
            });
            if (r.ok) {
                setReplyText('');
                setReplyFile(null);
                const data = await safeJson(`/api/support/tickets/${selectedTicketId}/replies`, { replies: [] });
                setTicketReplies(data.replies || []);
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {}
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        try {
            const r = await memberFetch('/api/support/member/tickets', {
                method: 'POST', body: JSON.stringify(ticketForm)
            });
            if (r.ok) {
                setShowTicketModal(false);
                setTicketForm({ subject: '', description: '', category: 'General' });
                const data = await safeJson('/api/support/member/tickets', { tickets: [] });
                setMemberTickets(data.tickets || []);
            }
        } catch (e) {}
    };

    // --------------------

    const applyForPledge = async () => {
        try {
            const polyRes = await memberFetch('/api/member/me/pledge-policy');
            const policy = await polyRes.json();
            const fee = policy.fee || 100;
            const duration = policy.duration || 14;

            if (!window.confirm(`Applying for a pledge will extend your contribution deadline by ${duration} days, but a KES ${fee} commitment fee will be applied to your account. Do you wish to proceed?`)) return;
            
            setLoading(true);
            const res = await memberFetch('/api/member/me/pledge', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                fetchAll(); 
            } else {
                alert(data.error || 'Failed to apply for pledge.');
            }
        } catch (e) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchPolls = async () => {
        try {
            const res = await memberFetch('/api/member/me/polls');
            const data = await res.json();
            setPolls(data.polls || []);
        } catch (_) {}
    };

    const downloadResolution = async (pollId) => {
        if (downloadingPdf) return;
        setDownloadingPdf(pollId);
        try {
            const res = await memberFetch(`/api/polls/${pollId}/resolution.pdf`, { method: 'POST' });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `Resolution_${pollId}.pdf`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        } catch (e) {
            alert('PDF Generation Failed: ' + e.message);
        } finally {
            setDownloadingPdf(null);
        }
    };

    const handleVote = async (pollId, optionId) => {
        try {
            const res = await memberFetch(`/api/member/me/polls/${pollId}/vote`, {
                method: 'POST',
                body: JSON.stringify({ optionId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            fetchPolls(); // Refresh local stats
        } catch (e) {
            alert(e.message);
        }
    };



    const handleDeletePot = async (id) => {
        if (!window.confirm('Are you sure you want to delete this savings goal? Any funds currently in the pot will be automatically moved to your Personal Wallet.')) return;
        try {
            const r = await memberFetch(`/api/member/me/target-savings/${id}`, { method: 'DELETE' });
            if (r.ok) {
                fetchAll();
            } else {
                const d = await r.json();
                alert(d.error || 'Failed to delete goal');
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    };

    const handleCreatePot = async (e) => {
        e.preventDefault();
        try {
            const res = await memberFetch('/api/member/me/target-savings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(potForm)
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || 'Failed to create pot');
            
            // Refresh pots
            const refresh = await memberFetch('/api/member/me/target-savings').then(r => r.json());
            setSavingsPots(refresh.pots || []);
            setPotForm({ name: '', targetAmount: '', deadline: '' });
            alert(data.message);
        } catch(err) {
            alert(err.message);
        }
    };

    const handleFundPot = async (e, overrides = null) => {
        if (e) e.preventDefault();
        const { potId, amount, mode } = overrides || fundForm;
        if (!amount || amount <= 0) return;

        setLoading(true);
        try {
            const endpoint = mode === 'withdraw' ? `/api/member/me/target-savings/${potId}/withdraw` : `/api/member/me/target-savings/${potId}/fund`;
            const res = await memberFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: Number(amount) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Operation failed');

            // Refresh personal balance and pots
            const [bRes, pRes] = await Promise.all([
                memberFetch('/api/member/me/balance').then(r => r.json()),
                memberFetch('/api/member/me/target-savings').then(r => r.json())
            ]);
            setStats(prev => ({ ...prev, ...(bRes || {}) }));
            setSavingsPots(pRes.pots || []);
            setFundForm({ potId: null, amount: '', mode: 'fund' });
            alert(data.message);
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyLoan = async (e, forcedMfaCode = null) => {
        if (e) e.preventDefault();
        setApplyingLoan(true);
        setLoanMsg(null);
        try {
            const body = { ...loanForm };
            if (forcedMfaCode) body.mfaCode = forcedMfaCode;

            const res = await memberFetch('/api/member/me/applications', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            
            if (res.status === 430) {
                const challenge = await res.json();
                setMfaChallenge({
                    ...challenge,
                    onConfirm: (code) => handleApplyLoan(null, code)
                });
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.message);
            
            setLoanMsg({ type: 'success', text: '✅ Application submitted! The finance team will review it shortly.' });
            setLoanForm({ amount: '', tenure: 6, reason: '' });
            setLoanApps(prev => [data, ...prev]);
            setMfaChallenge(null);
            setMfaCode('');
        } catch (err) {
            setLoanMsg({ type: 'error', text: err.message });
        } finally {
            setApplyingLoan(false);
        }
    };


    const requestMfaCode = async () => {
        setRequestingMfa(true);
        try {
            await memberFetch('/api/member/2fa/transaction/request', { method: 'POST' });
            alert('A new verification code has been sent to your phone.');
        } catch (err) {
            alert('Failed to send code: ' + err.message);
        } finally {
            setRequestingMfa(false);
        }
    };

    // Loan Calculator
    const calcMonthlyRepayment = () => {
        const principal = Number(calcAmount) || 0;
        const monthlyRate = calcRate / 100;
        if (monthlyRate === 0) return principal / calcTenure;
        return Math.round((principal * monthlyRate * Math.pow(1 + monthlyRate, calcTenure)) / (Math.pow(1 + monthlyRate, calcTenure) - 1));
    };
    const calcTotal = () => calcMonthlyRepayment() * calcTenure;
    const calcInterest = () => calcTotal() - calcAmount;

    const calcAmortizationSchedule = () => {
        const schedule = [];
        let balance = Number(calcAmount);
        const monthlyRate = calcRate / 100;
        const pmt = calcMonthlyRepayment();
        
        for (let month = 1; month <= calcTenure; month++) {
            const interestPayment = Math.round(balance * monthlyRate);
            let principalPayment = pmt - interestPayment;
            
            // Adjust last month
            if (month === calcTenure) {
                principalPayment = balance;
            }
            
            balance -= principalPayment;
            
            schedule.push({
                month,
                principalPayment,
                interestPayment,
                balance: balance > 0 ? balance : 0 
            });
        }
        return schedule;
    };

    const handleAddBeneficiary = async (e) => {
        if (e) e.preventDefault();
        setSavingBeneficiary(true);
        try {
            const res = await memberFetch('/api/member/me/beneficiaries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(beneficiaryForm)
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Failed to save beneficiary');
            
            setShowBeneficiaryModal(false);
            setBeneficiaryForm({ name: '', relationship: '', phone: '', allocationPercentage: '', idNumber: '' });
            fetchBeneficiaries();
        } catch (err) {
            alert(err.message);
        } finally {
            setSavingBeneficiary(true);
        }
    };

    const handleDeleteBeneficiary = async (id) => {
        if (!confirm('Are you sure you want to remove this beneficiary?')) return;
        try {
            await memberFetch(`/api/member/me/beneficiaries/${id}`, { method: 'DELETE' });
            fetchBeneficiaries();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteDocument = async (id) => {
        if (!confirm('Are you sure you want to permanently delete this document? This action cannot be undone.')) return;
        try {
            const r = await memberFetch(`/api/member/me/documents/${id}`, { method: 'DELETE' });
            if (r.ok) {
                fetchAll();
            } else {
                const d = await r.json();
                alert(d.error || 'Failed to delete document');
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    };
    
    const handleGuarantorRespond = async (requestId, status) => {
        if (!confirm(`Are you sure you want to ${status} this guarantor request?`)) return;
        setLoading(true);
        try {
            const res = await memberFetch(`/api/member/guarantors/${requestId}/respond`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Operation failed');
            alert(data.message);
            fetchAll(); // Refresh all data to update notifications and guarantor list
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async () => {
        setSavingProfile(true);
        setProfileMsg(null);
        try {
            const r = await memberFetch('/api/member/me/profile', {
                method: 'PUT',
                body: JSON.stringify({ email: profileEmail, phone: profilePhone })
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed to update profile');
            setProfileMsg({ type: 'success', text: d.message });
            fetchAll(); // Refresh data
        } catch (e) {
            setProfileMsg({ type: 'danger', text: e.message });
        } finally {
            setSavingProfile(false);
        }
    };

    const renderTabContent = () => {
        if (loading) return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="skeleton-box" style={{ width: 140, height: 12 }}></div>
                    <div className="skeleton-box" style={{ width: 180, height: 36, borderRadius: 8 }}></div>
                </div>

                {/* Skeleton Chart Card */}
                <div className="card shadow-lg" style={{ height: 300, display: 'flex', flexDirection: 'column' }}>
                    <div className="skeleton-box" style={{ width: 120, height: 16, marginBottom: '2rem' }}></div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '1rem' }}>
                        {Array(8).fill(0).map((_, i) => (
                            <div key={i} className="skeleton-box" style={{ flex: 1, height: `${20 + Math.random() * 60}%`, opacity: 0.2 }}></div>
                        ))}
                    </div>
                </div>

                {/* Skeleton Stat Cards */}
                <div className="grid grid-3">
                    {Array(3).fill(0).map((_, i) => (
                        <div key={i} className="card" style={{ padding: '1.25rem' }}>
                            <div className="skeleton-box" style={{ width: '60%', height: 12, marginBottom: '0.75rem' }}></div>
                            <div className="skeleton-box" style={{ width: '40%', height: 24 }}></div>
                        </div>
                    ))}
                </div>

                {/* Skeleton Table/List */}
                <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                        <div className="skeleton-box" style={{ width: 150, height: 14 }}></div>
                    </div>
                    <div style={{ padding: '1rem' }}>
                        {Array(4).fill(0).map((_, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                                    <div className="skeleton-box" style={{ width: 40, height: 40, borderRadius: 8 }}></div>
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton-box" style={{ width: '40%', height: 12, marginBottom: '0.5rem' }}></div>
                                        <div className="skeleton-box" style={{ width: '20%', height: 10 }}></div>
                                    </div>
                                    <div className="skeleton-box" style={{ width: 60, height: 14 }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );

        switch (activeTab) {
            case 'Profile Settings':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0 }}>👤 My Profile</h2>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>View and manage your personal account details.</p>
                            </div>
                        </div>

                        <div className="grid grid-2" style={{ alignItems: 'start' }}>
                            {/* Read-Only Admin Details */}
                            <div className="card shadow-lg" style={{ padding: '2rem' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <Shield size={20} className="text-accent" /> Institutional Records
                                </h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                                    These details are verified and managed by the Institutional Administration. 
                                    Please contact support if any of these records are inaccurate.
                                </p>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Full Name</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{stats?.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Registration Status</span>
                                        <span className={`stat-value ${stats?.registration_fee_paid ? 'text-success' : 'text-warning'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                                            {stats?.registration_fee_paid ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                                            {stats?.registration_fee_paid ? 'Settled' : 'Pending'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Membership Number</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>{stats?.membershipNumber}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>ID Number</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{stats?.idNumber || 'Not provided'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Join Date</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{new Date(stats?.joinDate).toLocaleDateString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Emergency Contact</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{stats?.emergencyContact}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Editable Contact Details */}
                            <div className="card shadow-lg" style={{ padding: '2rem' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <RefreshCw size={20} className="text-success" /> Manage Contact Info
                                </h3>
                                
                                {profileMsg && (
                                    <div className={`alert alert-${profileMsg.type}`} style={{ marginBottom: '1.5rem' }}>
                                        {profileMsg.text}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div className="form-group">
                                        <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
                                        <input 
                                            type="email" 
                                            className="input" 
                                            placeholder="Enter your email" 
                                            value={profileEmail} 
                                            onChange={e => setProfileEmail(e.target.value)} 
                                        />
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>Used for notifications and account recovery.</p>
                                    </div>

                                    <div className="form-group">
                                        <label style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone Number</label>
                                        <input 
                                            type="tel" 
                                            className="input" 
                                            placeholder="Enter new phone number" 
                                            value={profilePhone} 
                                            onChange={e => setProfilePhone(e.target.value)} 
                                        />
                                        {stats?.pending_phone && (
                                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--accent-dim)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                                                🕒 Awaiting approval for: {stats.pending_phone}
                                            </div>
                                        )}
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>Note: Phone number changes require manual admin approval for security.</p>
                                    </div>

                                    <button 
                                        className="btn btn-primary" 
                                        style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800 }} 
                                        onClick={updateProfile}
                                        disabled={savingProfile || (profileEmail === stats?.email && profilePhone === stats?.phone)}
                                    >
                                        {savingProfile ? 'SAVING CHANGES...' : 'SAVE PROFILE UPDATES'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Beneficiaries / Next of Kin Section */}
                        <div className="card shadow-lg" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <Users size={20} className="text-accent" /> Next of Kin & Beneficiaries
                                </h3>
                                <button className="btn btn-primary btn-sm" onClick={() => { setBeneficiaryForm({ name: '', relationship: '', phone: '', allocationPercentage: '', idNumber: '' }); setShowBeneficiaryModal(true); }}>
                                    + Add Beneficiary
                                </button>
                            </div>
                            
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
                                Maintain a record of your legal beneficiaries for transparency and institutional security.
                            </p>

                            <div className="table-wrap" style={{ margin: '0 -2rem', width: 'calc(100% + 4rem)' }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Full Name</th>
                                            <th>Relationship</th>
                                            <th>ID Number</th>
                                            <th>Phone</th>
                                            <th>Allocation</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {beneficiaries.length === 0 ? (
                                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No beneficiaries recorded yet.</td></tr>
                                        ) : (
                                            beneficiaries.map(b => (
                                                <tr key={b.id}>
                                                    <td style={{ fontWeight: 700 }}>{b.name}</td>
                                                    <td><span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>{b.relationship}</span></td>
                                                    <td style={{ fontSize: '0.8rem' }}>{b.idNumber || '---'}</td>
                                                    <td style={{ fontSize: '0.8rem' }}>{b.phone || '---'}</td>
                                                    <td style={{ fontWeight: 800, color: 'var(--success)' }}>{b.allocationPercentage}%</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setBeneficiaryForm(b); setShowBeneficiaryModal(true); }}>
                                                                <RefreshCw size={14} />
                                                            </button>
                                                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteBeneficiary(b.id)}>
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {showBeneficiaryModal && (
                            <div className="modal-overlay" style={{ zIndex: 1200 }}>
                                <div className="modal-box" style={{ maxWidth: 500 }}>
                                    <div className="modal-header">
                                        <h3>{beneficiaryForm.id ? 'Edit Beneficiary' : 'Add New Beneficiary'}</h3>
                                        <button className="btn btn-ghost btn-icon" onClick={() => setShowBeneficiaryModal(false)}>✕</button>
                                    </div>
                                    <form onSubmit={handleAddBeneficiary}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Full Name *</label>
                                                <input className="input" required value={beneficiaryForm.name} onChange={e => setBeneficiaryForm({...beneficiaryForm, name: e.target.value})} />
                                            </div>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Relationship *</label>
                                                <select className="input" required value={beneficiaryForm.relationship} onChange={e => setBeneficiaryForm({...beneficiaryForm, relationship: e.target.value})}>
                                                    <option value="">Select...</option>
                                                    <option value="Spouse">Spouse</option>
                                                    <option value="Child">Child</option>
                                                    <option value="Parent">Parent</option>
                                                    <option value="Sibling">Sibling</option>
                                                    <option value="Friend">Friend</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>ID Number</label>
                                            <input className="input" value={beneficiaryForm.idNumber} onChange={e => setBeneficiaryForm({...beneficiaryForm, idNumber: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Phone Number</label>
                                                <input className="input" value={beneficiaryForm.phone} onChange={e => setBeneficiaryForm({...beneficiaryForm, phone: e.target.value})} />
                                            </div>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Allocation (%) *</label>
                                                <input className="input" type="number" required min="0" max="100" value={beneficiaryForm.allocationPercentage} onChange={e => setBeneficiaryForm({...beneficiaryForm, allocationPercentage: e.target.value})} />
                                            </div>
                                        </div>
                                        <div className="modal-footer">
                                            <button type="button" className="btn btn-ghost" onClick={() => setShowBeneficiaryModal(false)}>Cancel</button>
                                            <button type="submit" className="btn btn-primary">Save Beneficiary</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                );

            case 'Overview':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0 }}>🌟 Welcome back, {stats?.name?.split(' ')[0] || 'Member'}!</h2>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Here is your financial status and recent activity for today.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button 
                                    className="btn btn-ghost" 
                                    style={{ gap: '0.5rem', color: 'var(--text-dim)' }}
                                    onClick={fetchAll}
                                    disabled={loading}
                                >
                                    <RefreshCw size={16} className={loading ? 'spin' : ''} /> <span>Sync Data</span>
                                </button>
                                <button 
                                    className="btn btn-accent" 
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}
                                    onClick={() => memberDownloadBlob('/api/member/me/passbook.pdf', `PASSBOOK_${stats?.name || 'MEMBER'}.pdf`)}
                                >
                                    <Download size={16} /> <span>Download Passbook</span>
                                </button>
                            </div>
                        </div>

                        {/* Wealth Growth Performance */}
                        <div className="card shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, right: 0, padding: '1rem', opacity: 0.1, pointerEvents: 'none' }}>
                                <Activity size={100} />
                            </div>
                            <h3 className="card-title" style={{ marginBottom: '1.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={18} className="text-accent" /> {getLabel('member_performance_title', 'Portfolio Performance (Past 12 Months)')}
                            </h3>
                            <div style={{ width: '100%', height: 250 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={wealthHistory}>
                                        <defs>
                                            <linearGradient id="colorWealth" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                        <XAxis 
                                            dataKey="month" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 10, fill: 'var(--text-dim)' }}
                                            dy={10}
                                        />
                                        <YAxis 
                                            hide 
                                            domain={['dataMin - 1000', 'dataMax + 1000']} 
                                        />
                                        <Tooltip 
                                            contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.8rem' }}
                                            formatter={(value) => [fmt(value), 'Total Wealth']}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="cumulativeWealth" 
                                            stroke="var(--accent)" 
                                            strokeWidth={3}
                                            fillOpacity={1} 
                                            fill="url(#colorWealth)" 
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Consolidated Wealth</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--member-accent)' }}>{fmt((stats?.savings || 0) + (stats?.personalWallet || 0))}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Growth Rank</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>Top 15%</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            {/* SACCO Savings Card */}
                            <div className="card shadow-lg" style={{ background: 'linear-gradient(135deg, var(--surface), rgba(16,185,129,0.03))', borderLeft: '4px solid var(--success)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>{getLabel('member_savings_label', 'SACCO Savings')}</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--success)', marginTop: '0.5rem' }}>{fmt(stats?.savings || 0)}</div>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                                            {getLabel('member_savings_desc', 'Institutional deposits and share capital.')}
                                        </p>
                                    </div>
                                    <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: 12, color: 'var(--success)' }}>
                                        <PiggyBank size={20} />
                                    </div>
                                </div>
                            </div>

                            {/* Personal Wallet Card */}
                            <div className="card shadow-lg" style={{ background: 'linear-gradient(135deg, var(--surface), rgba(99,102,241,0.03))', borderLeft: '4px solid var(--accent)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>{getLabel('member_wallet_label', 'Personal Wallet')}</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--accent)', marginTop: '0.5rem' }}>{fmt(stats?.personalWallet || 0)}</div>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                                            {getLabel('member_wallet_desc', 'Liquid funds for savings goals and instant withdrawals.')}
                                        </p>
                                    </div>
                                    <div style={{ padding: '0.75rem', background: 'rgba(99,102,241,0.1)', borderRadius: 12, color: 'var(--accent)' }}>
                                        <Wallet size={20} />
                                    </div>
                                </div>
                            </div>

                            {/* Welfare Fund Card */}
                            <div className="card shadow-lg" style={{ background: 'linear-gradient(135deg, var(--surface), rgba(244,63,94,0.03))', borderLeft: '4px solid var(--danger)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Welfare Fund</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--danger)', marginTop: '0.5rem' }}>{fmt(stats?.welfareBalance || 0)}</div>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                                            Community protection pool for emergencies and welfare.
                                        </p>
                                    </div>
                                    <div style={{ padding: '0.75rem', background: 'rgba(244,63,94,0.1)', borderRadius: 12, color: 'var(--danger)' }}>
                                        <Heart size={20} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-2">
                             {/* Pledge Status Chart */}
                            <div className="card shadow-sm" style={{ display: 'flex', flexDirection: 'column' }}>
                                <h3 className="card-title" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>🛡️ Commitment Health</h3>
                                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: '100%', height: 180 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Honored', value: pledges.filter(p => p.status === 'fulfilled').length },
                                                        { name: 'Pending', value: pledges.filter(p => p.status !== 'fulfilled').length }
                                                    ]}
                                                    cx="50%" cy="50%" innerRadius={50} outerRadius={65} paddingAngle={5} dataKey="value" stroke="none"
                                                >
                                                    <Cell fill="var(--success)" />
                                                    <Cell fill="rgba(99,102,241,0.2)" />
                                                </Pie>
                                                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.75rem' }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div style={{ position: 'absolute', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>
                                            {pledges.length > 0 ? Math.round((pledges.filter(p => p.status === 'fulfilled').length / pledges.length) * 100) : 0}%
                                        </div>
                                        <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Score</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
                                    {pledges.filter(p => p.status === 'fulfilled').length} of {pledges.length} commitments fulfilled
                                </div>
                            </div>

                             <div className="card shadow-sm" style={{ background: 'linear-gradient(135deg, var(--surface), rgba(251,191,36,0.03))' }}>
                                <h3 className="card-title" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Award size={18} className="text-warning" style={{ color: '#fbbf24' }} /> Trust Score Insights
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {/* Breakdown */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Payment Consistency</span>
                                            <span style={{ fontWeight: 700, color: 'var(--success)' }}>+{Math.min(20, (stats?.factors?.payments || 0) * 2)} pts</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Governance Participation</span>
                                            <span style={{ fontWeight: 700, color: 'var(--success)' }}>+{Math.min(15, (stats?.factors?.attendance || 0) * 3)} pts</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Discipline Multiplier</span>
                                            <span style={{ fontWeight: 700, color: (stats?.factors?.penalties || 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                                {(stats?.factors?.penalties || 0) > 0 ? `-${(stats?.factors?.penalties * 10)} pts` : '+10 pts'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actionable Tip */}
                                    <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <div style={{ color: '#fbbf24', marginTop: '0.2rem' }}><Activity size={16} /></div>
                                            <div style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                                                <strong>Pro Tip:</strong> 
                                                {(stats?.score || 0) < 90 ? (
                                                    (stats?.factors?.penalties || 0) > 0 
                                                    ? ' Clear your unpaid penalties to instantly restore +10 points to your score.'
                                                    : ' Attend the next group meeting to boost your governance participation by +3 points.'
                                                ) : ' You are a Platinum Elite member! Maintain this score for priority loan processing.'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Rating Guide / Legend */}
                                    <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 800 }}>Rating Guide</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ height: '4px', background: 'var(--success)', borderRadius: 2, marginBottom: '0.4rem' }}></div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700 }}>90+</div>
                                                <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>Platinum</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ height: '4px', background: 'var(--accent)', borderRadius: 2, marginBottom: '0.4rem' }}></div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700 }}>80+</div>
                                                <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>Excellent</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ height: '4px', background: '#fbbf24', borderRadius: 2, marginBottom: '0.4rem' }}></div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700 }}>70+</div>
                                                <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>Good</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ height: '4px', background: 'var(--danger)', borderRadius: 2, marginBottom: '0.4rem' }}></div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: 700 }}>&lt;40</div>
                                                <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>Warning</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                    </div>

                    {/* Recent Activity Grid */}
                        <div className="grid grid-2">
                            {/* Notifications & Alerts */}
                            <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Bell size={18} className="text-accent" /> Recent Notifications
                                    </h3>
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => fetchAll()}>Refresh</button>
                                </div>
                                <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>No new notifications.</div>
                                    ) : (
                                        notifications.slice(0, 4).map(n => (
                                            <div key={n.id} style={{ 
                                                padding: '0.75rem 1rem', 
                                                borderRadius: '8px', 
                                                display: 'flex', 
                                                gap: '0.75rem', 
                                                background: n.isRead ? 'transparent' : 'rgba(99,102,241,0.05)',
                                                borderLeft: `3px solid ${n.type === 'success' ? 'var(--success)' : (n.type === 'danger' ? 'var(--danger)' : 'var(--accent)')}`
                                            }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{n.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{n.message}</div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>{new Date(n.timestamp).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Dividends & Wealth Stats */}
                            <div className="card shadow-sm" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, var(--surface), rgba(99,102,241,0.03))' }}>
                                <h3 className="card-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Award size={18} className="text-accent" /> Shared Prosperity
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Lifetime Dividends</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success)' }}>{fmt(dividends.reduce((s, d) => s + d.amount, 0))}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Automatically credited to your Share Capital.</div>
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Last Distribution</div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{dividends.length > 0 ? new Date(dividends[0].distributionDate).toLocaleDateString() : '---'}</div>
                                        </div>
                                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/member/portal/dividends')}>View Full History <ArrowRight size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'Savings Pots':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                            {/* Create New Pot Card */}
                            <div className="card" style={{ border: '1px dashed var(--border)', background: 'transparent' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>🎯 Create New Saving Goal</h3>
                                <form onSubmit={handleCreatePot} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label>Goal Name *</label>
                                        <input className="input" required value={potForm.name} onChange={e => setPotForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Vacation, Emergency" />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label>Target Amount (KES) *</label>
                                        <input className="input" type="number" required min="1000" value={potForm.targetAmount} step="1" onChange={e => setPotForm(f => ({ ...f, targetAmount: e.target.value }))} placeholder="50000" />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label>Target Deadline (Optional)</label>
                                        <input className="input" type="date" value={potForm.deadline} onChange={e => setPotForm(f => ({ ...f, deadline: e.target.value }))} />
                                    </div>
                                    <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Create Goal</button>
                                </form>
                            </div>


                            {/* Existing Pots */}
                            {(savingsPots || []).map(pot => {
                                const percent = Math.min(100, Math.round((pot.currentAmount / pot.targetAmount) * 100));
                                return (
                                    <div key={pot.id} className="card shadow-sm" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{pot.name}</h3>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.7rem', color: pot.status === 'active' ? 'var(--success)' : 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase' }}>{pot.status}</span>
                                                    <button 
                                                        className="btn btn-ghost btn-icon btn-sm" 
                                                        onClick={() => handleDeletePot(pot.id)}
                                                        style={{ color: 'var(--danger)', padding: '0.2rem' }}
                                                        title="Delete Goal"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Progress</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{percent}%</span>
                                            </div>
                                            
                                            <div style={{ width: '100%', height: '8px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                                                <div style={{ width: `${percent}%`, height: '100%', background: percent >= 100 ? 'var(--success)' : 'var(--member-accent)', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.5rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Saved So Far</div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--member-accent)' }}>KES {Number(pot.currentAmount).toLocaleString()}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Target Goal</div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>KES {Number(pot.targetAmount).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {pot.status === 'active' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {fundForm.potId === pot.id ? (
                                                    <form onSubmit={handleFundPot} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 8 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: fundForm.mode === 'fund' ? 'var(--accent)' : 'var(--danger)' }}>
                                                                {fundForm.mode === 'fund' ? 'Allocate to Pot' : 'Withdraw to Wallet'}
                                                            </span>
                                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFundForm({ potId: null, amount: '', mode: 'fund' })}>✕</button>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <input 
                                                                className="input" 
                                                                type="number" 
                                                                min="1" 
                                                                max={fundForm.mode === 'fund' ? undefined : pot.currentAmount}
                                                                required 
                                                                value={fundForm.amount} 
                                                                onChange={e => setFundForm(f => ({ ...f, amount: e.target.value }))} 
                                                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }}
                                                            />
                                                            <button type="submit" className={`btn ${fundForm.mode === 'fund' ? 'btn-primary' : 'btn-danger'}`} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                                                                Confirm
                                                            </button>
                                                        </div>
                                                    </form>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button 
                                                            className="btn btn-sm" 
                                                            style={{ flex: 1, border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent' }}
                                                            onClick={() => setFundForm({ potId: pot.id, amount: '', mode: 'fund' })}
                                                        >
                                                            + Allocate
                                                        </button>
                                                        <button 
                                                            className="btn btn-sm" 
                                                            style={{ flex: 1, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}
                                                            onClick={() => setFundForm({ potId: pot.id, amount: '', mode: 'withdraw' })}
                                                        >
                                                            - Withdraw
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Wallet Activity Table */}
                        <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <Activity size={18} className="text-accent" /> Wallet Activity
                                </h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Recent internal movements</div>
                            </div>
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Description</th>
                                            <th>Type</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledger.map(entry => (
                                            <tr key={entry.id}>
                                                <td>{new Date(entry.date).toLocaleDateString()}</td>
                                                <td>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{entry.description}</div>
                                                    <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{entry.source.toUpperCase()} Ref: {entry.reference || 'N/A'}</div>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                                                        {entry.type}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 800, color: entry.amount < 0 ? 'var(--danger)' : 'var(--success)' }}>
                                                    {entry.amount < 0 ? '-' : '+'}{fmt(Math.abs(entry.amount))}
                                                </td>
                                            </tr>
                                        ))}
                                        {ledger.length === 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                    No wallet activity recorded yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                );
            case 'Payments':
                const mpesaTotal = mpesaAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {/* M-Pesa Payment UI */}
                        {systemSettings?.toggle_mpesa_integration !== 'false' ? (
                            <div className="card shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: 0, right: 0, width: 150, height: 150, background: 'linear-gradient(135deg, var(--success) 0%, transparent 100%)', opacity: 0.1, borderRadius: '50%', transform: 'translate(30%, -30%)', pointerEvents: 'none' }}></div>
                            
                            <div style={{ padding: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <Wallet size={24} className="text-success" /> Payment Center
                                        </h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Securely manage your contributions and fees via M-Pesa.</p>
                                    </div>
                                    <div style={{ padding: '0.75rem 1.25rem', background: stats?.registration_fee_paid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', border: stats?.registration_fee_paid ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Registration Fee</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, color: stats?.registration_fee_paid ? 'var(--success)' : 'var(--warning)', fontSize: '0.9rem' }}>
                                            {stats?.registration_fee_paid ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                                            {stats?.registration_fee_paid ? 'SETTLED' : 'PENDING'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Smartphone size={24} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Pay via M-Pesa</h3>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Instant deposit from your phone to your SACCO account.</p>
                                    </div>
                                </div>

                                {mpesaStatus === 'completed' ? (
                                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                            <CheckCircle size={32} />
                                        </div>
                                        <h3 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>Payment Successful!</h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Your funds have been deposited.</p>
                                        <button className="btn btn-ghost" onClick={() => { setMpesaStatus(null); setMpesaAllocations([{ type: 'Share Capital', amount: '' }]); }}>Make Another Payment</button>
                                    </div>
                                ) : mpesaStatus === 'pending' ? (
                                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                        <div className="spin" style={{ width: 40, height: 40, border: '4px solid var(--success)', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 1.5rem' }}></div>
                                        <h3 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Waiting for M-Pesa...</h3>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
                                            A prompt has been sent to <strong>{mpesaPhone || profilePhone}</strong>. Please enter your M-Pesa PIN to complete the KES {mpesaTotal.toLocaleString()} payment.
                                        </p>
                                    </div>
                                ) : (
                                    <form onSubmit={handleMpesaSubmit}>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label>M-Pesa Phone Number</label>
                                            <input 
                                                className="input" 
                                                type="tel" 
                                                value={mpesaPhone} 
                                                onChange={e => setMpesaPhone(e.target.value)} 
                                                placeholder={profilePhone || "2547XXXXXXXX"} 
                                            />
                                        </div>

                                        <label style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>Payment Breakdown</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                                            {mpesaAllocations.map((alloc, idx) => (
                                                <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <select 
                                                        className="input" 
                                                        style={{ flex: 1 }}
                                                        value={alloc.type} 
                                                        onChange={e => {
                                                            const newAlloc = [...mpesaAllocations];
                                                            newAlloc[idx].type = e.target.value;
                                                            setMpesaAllocations(newAlloc);
                                                        }}
                                                    >
                                                        <option value="Share Capital">Share Capital</option>
                                                        <option value="Savings">Normal Savings</option>
                                                        <option value="Personal Savings">Personal Wallet (Goals)</option>
                                                        <option value="Welfare Fund">Welfare Fund</option>
                                                        <option value="Registration Fee">Registration Fee</option>
                                                        <option value="Loan Repayment">Loan Repayment</option>
                                                        <option value="Penalty">Fines / Penalty</option>
                                                    </select>
                                                    <input 
                                                        className="input" 
                                                        type="number" 
                                                        min="0"
                                                        placeholder="Amount"
                                                        value={alloc.amount}
                                                        step="1"
                                                        onChange={e => {
                                                            const newAlloc = [...mpesaAllocations];
                                                            newAlloc[idx].amount = e.target.value;
                                                            setMpesaAllocations(newAlloc);
                                                        }}
                                                        style={{ width: '120px' }}
                                                        required
                                                    />
                                                    {mpesaAllocations.length > 1 && (
                                                        <button 
                                                            type="button" 
                                                            className="btn btn-ghost btn-icon" 
                                                            onClick={() => setMpesaAllocations(mpesaAllocations.filter((_, i) => i !== idx))}
                                                            style={{ color: 'var(--danger)' }}
                                                        >✕</button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                            <button 
                                                type="button" 
                                                className="btn btn-ghost btn-sm" 
                                                onClick={() => setMpesaAllocations([...mpesaAllocations, { type: 'Savings', amount: '' }])}
                                                style={{ border: '1px dashed var(--border)', flex: 1 }}
                                            >+ Add Allocation</button>
                                            
                                            <button 
                                                type="button" 
                                                className="btn btn-accent btn-sm" 
                                                onClick={() => setMpesaAllocations([
                                                    { type: 'Savings', amount: '1000' },
                                                    { type: 'Welfare Fund', amount: '100' }
                                                ])}
                                                style={{ flex: 1, fontWeight: 700 }}
                                            >Standard Monthly (1,100)</button>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'var(--surface-2)', borderRadius: 8, marginTop: '1rem' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Total Amount</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--success)' }}>
                                                KES {mpesaTotal.toLocaleString()}
                                            </span>
                                        </div>

                                        {mpesaStatus === 'failed' && (
                                            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: 8, fontSize: '0.85rem', textAlign: 'center' }}>
                                                Payment cancelled or failed. Please try again.
                                            </div>
                                        )}

                                        <button type="submit" className="btn" style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', background: 'var(--success)', color: '#fff', fontSize: '1rem', fontWeight: 800, borderRadius: 8 }}>
                                            Initiate STK Push
                                        </button>
                                    </form>
                                )}
                            </div>
                            </div>
                        ) : null}



                        {/* Existing Payments Table */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Payment History</h3>
                                <button 
                                    className="btn btn-accent btn-sm" 
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    onClick={() => memberDownloadBlob('/api/member/me/statement.pdf', `Statement_${stats?.name || 'Member'}.pdf`)}
                                >
                                    <FileText size={14} /> Download Full Statement
                                </button>
                            </div>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Category</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Ref</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => (
                                            <tr key={p.id}>
                                                <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                                                <td>{p.walletType}</td>
                                                <td style={{ fontWeight: 700 }}>{fmt(p.amount)}</td>
                                                <td><span className={`badge badge-${p.status === 'completed' ? 'success' : 'warning'}`}>{p.status}</span></td>
                                                <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{p.transactionRef || p.reference || 'N/A'}</td>
                                                <td>
                                                    <button className="btn btn-ghost btn-icon" title="Download Receipt"
                                                        onClick={() => memberDownloadBlob(`/api/member/me/payments/${p.id}/receipt.pdf`, `Receipt_${p.reference || p.id}.pdf`)}>
                                                        <FileText size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {payments.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>No payment history found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            case 'Loans':
                const monthlyRepayment = (amount, months, rate) => {
                    const r = rate / 100;
                    if (r === 0) return amount / months;
                    return (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
                };
                const totalInterestAmt = (amount, months, rate) => (monthlyRepayment(amount, months, rate) * months) - amount;

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Eligibility Pre-Check Card */}
                        <div className="card shadow-lg" style={{ background: 'linear-gradient(135deg, var(--surface-2), var(--surface))', border: '1px solid var(--accent-dim)', padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Loan Eligibility Pre-Check</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '500px' }}>
                                        Based on your current savings of <strong>{fmt(stats?.savings || 0)}</strong> and a trust score of <strong>{stats?.score}%</strong>, here is your estimated borrowing power.
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Maximum Possible</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>{fmt((stats?.savings || 0) * 3)}</div>
                                </div>
                            </div>
                            
                            <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                <div style={{ padding: '1rem', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Available Limit</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.25rem' }}>{fmt(stats?.availableLimit || 0)}</div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Adjusted for active loans</div>
                                </div>
                                <div style={{ padding: '1rem', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Trust Multiplier</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.25rem' }}>{(stats?.score || 0) >= 80 ? '3.0x (Standard)' : '1.5x (Restricted)'}</div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Based on {stats?.rating} rating</div>
                                </div>
                                <div style={{ padding: '1rem', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Processing Speed</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.25rem' }}>{(stats?.score || 0) >= 90 ? 'Instant' : '2-3 Business Days'}</div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Subject to review</div>
                                </div>
                            </div>
                        </div>

                        {/* Loan Simulator Section */}
                        <div className="card shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: -10, right: 20, background: 'var(--accent)', color: '#fff', fontSize: '0.65rem', fontWeight: 900, padding: '4px 10px', borderRadius: '4px', letterSpacing: '0.05em' }}>PREMIUM TOOL</div>
                            <h3 className="card-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={18} className="text-accent" /> Interactive Loan Simulator
                            </h3>
                            <div className="grid grid-2" style={{ gap: '2rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div className="form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }}>LOAN PRINCIPAL</label>
                                            <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{fmt(calcAmount)}</span>
                                        </div>
                                        <input type="range" min="1000" max={stats?.availableLimit || 2000000} step="1000" value={calcAmount} onChange={e => setCalcAmount(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                    </div>
                                    <div className="form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }}>REPAYMENT PERIOD</label>
                                            <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{calcTenure} Months</span>
                                        </div>
                                        <input type="range" min="1" max="36" step="1" value={calcTenure} onChange={e => setCalcTenure(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                    </div>
                                    <div className="form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }}>INTEREST RATE (MONTHLY %)</label>
                                            <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{calcRate}%</span>
                                        </div>
                                        <input type="range" min="1" max="25" step="0.5" value={calcRate} onChange={e => setCalcRate(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                    </div>
                                </div>
                                <div style={{ background: 'var(--surface-2)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center', marginBottom: '0.5rem' }}>ESTIMATED MONTHLY REPAYMENT</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent)', textAlign: 'center', letterSpacing: '-0.02em' }}>{fmt(monthlyRepayment(calcAmount, calcTenure, calcRate))}</div>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                        <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>TOTAL INTEREST</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{fmt(totalInterestAmt(calcAmount, calcTenure, calcRate))}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', flex: 1, borderLeft: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>TOTAL PAYABLE</div>
                                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{fmt(calcAmount + totalInterestAmt(calcAmount, calcTenure, calcRate))}</div>
                                        </div>
                                    </div>
                                    <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%', background: 'var(--accent)' }} onClick={() => { setLoanForm({ ...loanForm, amount: calcAmount, tenure: calcTenure }); navigate('/member/portal/apply-for-loan'); }}>
                                        Apply for this Loan
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Existing Loans Table */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div className="table-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Active & Historical Loans</h3>
                            </div>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Disbursed</th>
                                            <th>Amount</th>
                                            <th>Principal</th>
                                            <th>Interest</th>
                                            <th>Balance</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loans.map(l => (
                                            <tr key={l.id}>
                                                <td>{l.disbursedDate ? new Date(l.disbursedDate).toLocaleDateString() : 'Pending'}</td>
                                                <td style={{ fontWeight: 700 }}>{fmt(l.amount)}</td>
                                                <td>{fmt(l.originalPrincipal || l.amount)}</td>
                                                <td>{fmt(l.totalInterest || 0)}</td>
                                                <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(l.amount - (l.paid || 0))}</td>
                                                <td><span className={`badge badge-${l.status === 'active' ? 'warning' : 'success'}`}>{l.status}</span></td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                        <button className="btn btn-ghost btn-icon" title="Payment History" onClick={() => setHistory(l)}>
                                                            <Clock size={16} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon" title="Download Statement" onClick={() => memberDownloadBlob(`/api/export/me/loans/${l.id}/statement.pdf`, `Loan_Statement_${l.id}.pdf`)}>
                                                            <FileText size={16} style={{ color: 'var(--accent)' }} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon" title="Download Agreement" onClick={() => memberDownloadBlob(`/api/member/me/loans/${l.id}/receipt.pdf`, `Loan_Agreement_${l.id}.pdf`)}>
                                                            <Download size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {loans.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>No active or past loans on record.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            case 'Notifications':
                return <Notifications type="member" />;
            case 'Polls':
                return (
                    <div className="grid grid-2" style={{ gap: '1.5rem' }}>
                        {polls.map(p => (
                            <div key={p.id} className="card shadow-sm" style={{ borderTop: p.status === 'active' ? '4px solid var(--accent)' : '4px solid var(--text-dim)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: p.status === 'active' ? 'var(--accent)' : 'var(--text-dim)' }}>
                                        {p.status === 'active' ? '● Active Poll' : '🔒 Closed Poll'}
                                    </span>
                                    {p.votedOption && <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '4px' }}>✓ VOTED</span>}
                                </div>
                                <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.4 }}>{p.question}</h3>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {p.options?.map(opt => {
                                        const isMyVote = p.votedOption === opt.id;
                                        const showResults = p.votedOption || p.status === 'closed';
                                        
                                        return (
                                            <div key={opt.id} style={{ position: 'relative' }}>
                                                <button 
                                                    className="btn"
                                                    disabled={!!p.votedOption || p.status === 'closed'}
                                                    onClick={() => handleVote(p.id, opt.id)}
                                                    style={{ 
                                                        width: '100%', 
                                                        textAlign: 'left', 
                                                        justifyContent: 'flex-start',
                                                        padding: '1rem',
                                                        background: isMyVote ? 'rgba(99,102,241,0.08)' : 'var(--surface-2)',
                                                        border: isMyVote ? '1px solid var(--accent)' : '1px solid var(--border)',
                                                        color: 'var(--text-primary)',
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                        zIndex: 2
                                                    }}
                                                >
                                                    {showResults && (
                                                        <div style={{ 
                                                            position: 'absolute', 
                                                            top: 0, left: 0, bottom: 0, 
                                                            width: `${opt.percent}%`, 
                                                            background: isMyVote ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', 
                                                            zIndex: -1,
                                                            transition: 'width 1s ease-out'
                                                        }}></div>
                                                    )}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: isMyVote ? 700 : 500 }}>{opt.optionText}</span>
                                                        {showResults && <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isMyVote ? 'var(--accent)' : 'var(--text-dim)' }}>{opt.percent}%</span>}
                                                    </div>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                        {p.totalVotes || 0} votes cast
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                                        {p.status === 'active' ? (
                                            `Ends: ${new Date(p.closeDate || Date.now()).toLocaleDateString()}`
                                        ) : (
                                            <button className="btn btn-primary btn-sm" 
                                                disabled={downloadingPdf === p.id}
                                                onClick={() => downloadResolution(p.id)} 
                                                style={{ fontSize: '0.7rem', padding: '0.3rem 0.8rem', gap: '0.4rem' }}>
                                                {downloadingPdf === p.id ? '⌛ Generating...' : '⬇ Download Resolution PDF'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {polls.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-dim)' }}>
                            <Activity size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                            <p>No active governance polls found.</p>
                        </div>}
                    </div>
                );
            case 'Pledges':
                return (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>My Commitment Records</h3>
                             <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => memberDownloadBlob('/api/member/me/pledge-history.pdf', 'Pledge_History.pdf')} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                                    <Download size={16} /> Download History
                                </button>
                                <button className="btn btn-primary" onClick={applyForPledge} disabled={loading} style={{ background: 'var(--accent)' }}>
                                    <Award size={16} /> Apply for Pledge
                                </button>
                             </div>
                        </div>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Pledge Goal</th>
                                        <th>Target</th>
                                        <th>Fulfilled</th>
                                        <th>Balance</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Receipt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pledges.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>Pledge Extension (Until {new Date(p.targetDate).toLocaleDateString()})</td>
                                            <td>{fmt(p.pledgeFee)}</td>
                                            <td style={{ color: p.paidStatus === 'paid' ? 'var(--success)' : 'var(--danger)' }}>
                                                {p.paidStatus === 'paid' ? fmt(p.pledgeFee) : fmt(0)}
                                            </td>
                                            <td>{p.paidStatus === 'paid' ? fmt(0) : fmt(p.pledgeFee)}</td>
                                            <td>
                                                <span className={`badge badge-${p.paidStatus === 'paid' ? 'success' : 'warning'}`}>
                                                    {p.paidStatus === 'paid' ? 'Fulfilled' : 'Active'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {p.paidStatus === 'paid' ? (
                                                    <button className="btn btn-ghost btn-icon" title="Download Receipt" 
                                                        onClick={() => memberDownloadBlob(`/api/member/me/pledges/${p.id}/receipt.pdf`, `Pledge_Receipt_${p.id}.pdf`)}>
                                                        <FileText size={16} />
                                                    </button>
                                                ) : <span style={{ opacity: 0.3 }}>—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {pledges.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>You have no recorded pledges.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'ID & KYC':
                return (
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>My Identity Documents</h3>
                        <div style={{ padding: '2rem', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-dim)' }}>
                            <FileText size={40} style={{ margin: '0 auto 1rem', display: 'block' }} />
                            <p>Manage your KYC documents (ID, Passport, Passport Photo).</p>
                            <div className="grid grid-3" style={{ marginTop: '2rem' }}>
                                {documents.map((d, i) => (
                                    <div key={i} className="card" style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <FileText size={20} className="text-accent" />
                                            <span style={{ fontSize: '0.6rem', color: 'var(--success)' }}>VERIFIED</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{d.documentType || 'Document'}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button className="btn btn-ghost btn-icon" title="View Document" onClick={() => memberViewBlob(`/api/documents/kyc/${d.filename}`)}>
                                                    <Eye size={14} />
                                                </button>
                                                <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} title="Delete Document" onClick={() => handleDeleteDocument(d.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: '2rem', background: '#6366f1' }} onClick={() => setShowKycModal(true)}>+ Upload Document</button>
                        </div>
                    </div>
                );
            case 'Guarantors':
                const pendingRequests = guarantors.filter(g => g.status === 'pending');
                const activeGuarantees = guarantors.filter(g => g.status === 'approved');
                
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {/* Pending Requests Section */}
                        {pendingRequests.length > 0 && (
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <AlertTriangle className="text-warning" size={20} /> Pending Action Required
                                </h3>
                                <div className="grid grid-2">
                                    {pendingRequests.map(req => (
                                        <div key={req.id} className="card shadow-lg" style={{ borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.02)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Borrower Request</div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.2rem' }}>{req.borrowerName}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Loan Amount</div>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--accent)' }}>{fmt(req.loanAmount)}</div>
                                                </div>
                                            </div>
                                            
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                                This member has requested you to be their guarantor for the loan mentioned above. 
                                                By approving, you agree to be legally responsible for this debt if the borrower defaults.
                                            </p>
                                            
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{ flex: 1, background: 'var(--success)' }}
                                                    onClick={() => handleGuarantorRespond(req.id, 'approved')}
                                                >
                                                    Approve Guarantee
                                                </button>
                                                <button 
                                                    className="btn btn-ghost" 
                                                    style={{ flex: 1, color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                                    onClick={() => handleGuarantorRespond(req.id, 'rejected')}
                                                >
                                                    Decline Request
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Active Obligations Section */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Institutional Guarantee Registry</h3>
                            </div>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Borrower</th>
                                            <th>Original Principal</th>
                                            <th>Current Balance</th>
                                            <th>Status</th>
                                            <th>Your Exposure</th>
                                            <th>Risk Level</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeGuarantees.map(g => {
                                            const balance = Math.max(0, g.loanAmount - (g.totalRepaid || 0));
                                            const exposure = balance / 2; // Assuming 2 guarantors usually
                                            return (
                                                <tr key={g.id}>
                                                    <td style={{ fontWeight: 700 }}>{g.borrowerName}</td>
                                                    <td>{fmt(g.loanAmount)}</td>
                                                    <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(balance)}</td>
                                                    <td><span className={`badge badge-${g.loanStatus === 'active' ? 'warning' : 'success'}`}>{g.loanStatus}</span></td>
                                                    <td style={{ fontWeight: 800 }}>{fmt(exposure)}</td>
                                                    <td>
                                                        <span className={`badge badge-${balance > g.loanAmount * 0.7 ? 'danger' : (balance > 0 ? 'warning' : 'success')}`} style={{ fontSize: '0.65rem' }}>
                                                            {balance > g.loanAmount * 0.7 ? 'HIGH RISK' : (balance > 0 ? 'MODERATE' : 'CLEARED')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {activeGuarantees.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)', opacity: 0.5 }}>No active guarantor obligations found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            case 'Registration Fee':
                const regFeePayments = payments.filter(p => p.walletType === 'Registration Fee' && p.status === 'completed');
                const totalRegPaid = regFeePayments.reduce((sum, p) => sum + p.amount, 0);
                
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div className="card shadow-lg" style={{ background: stats?.registration_fee_paid ? 'linear-gradient(135deg, var(--surface), rgba(16,185,129,0.05))' : 'linear-gradient(135deg, var(--surface), rgba(245,158,11,0.05))', borderLeft: `6px solid ${stats?.registration_fee_paid ? 'var(--success)' : 'var(--warning)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>Membership Registration Status</h2>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                        {stats?.registration_fee_paid 
                                            ? '✅ Your membership registration is fully settled and verified.' 
                                            : '⚠️ Your membership registration fee is currently pending settlement.'}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800 }}>Total Paid</div>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: stats?.registration_fee_paid ? 'var(--success)' : 'var(--warning)' }}>{fmt(totalRegPaid)}</div>
                                </div>
                            </div>
                        </div>

                        <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Registration Payment History</h3>
                            </div>
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Reference</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {regFeePayments.map(p => (
                                            <tr key={p.id}>
                                                <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                                                <td style={{ fontWeight: 700 }}>{p.reference}</td>
                                                <td style={{ fontWeight: 800 }}>{fmt(p.amount)}</td>
                                                <td><span className="badge badge-success">Completed</span></td>
                                            </tr>
                                        ))}
                                        {regFeePayments.length === 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                    No registration fee payments found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {!stats?.registration_fee_paid && systemSettings?.toggle_mpesa_integration !== 'false' && (
                            <div className="card" style={{ background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--accent)' }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>How to settle your registration fee</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    You can settle your registration fee by making a payment through the <strong>Payments</strong> tab. Ensure you select "Registration Fee" as the wallet type during the M-Pesa transaction.
                                </p>
                                <button className="btn btn-accent" style={{ marginTop: '1rem' }} onClick={() => navigate('/member/portal/payments')}>
                                    Go to Payments
                                </button>
                            </div>
                        )}
                    </div>
                );
            case 'Welfare':
                const welfareHistory = ledger.filter(l => l.type === 'WELFARE' || l.description?.includes('Welfare'));
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div className="card shadow-lg" style={{ background: 'linear-gradient(135deg, var(--surface), rgba(244,63,94,0.05))', borderLeft: '6px solid #f43f5e' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>Welfare Fund Balance</h2>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                                        Collective social security fund for member support and community initiatives.
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 800 }}>Accumulated Balance</div>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f43f5e' }}>{fmt(stats?.welfareBalance || 0)}</div>
                                </div>
                            </div>
                        </div>

                        <div className="card shadow-sm" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Welfare Contribution History</h3>
                            </div>
                            <div className="table-wrap">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Description</th>
                                            <th>Amount</th>
                                            <th>Reference</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {welfareHistory.map(l => (
                                            <tr key={l.id}>
                                                <td>{new Date(l.date).toLocaleDateString()}</td>
                                                <td>{l.description}</td>
                                                <td style={{ fontWeight: 800, color: 'var(--success)' }}>+{fmt(l.amount)}</td>
                                                <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{l.reference || 'SYSTEM'}</td>
                                            </tr>
                                        ))}
                                        {welfareHistory.length === 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                    No welfare contributions recorded yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            case 'Penalties':
                return (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Issued Date</th>
                                        <th>Reason</th>
                                        <th>Penalty Amount</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {penalties.map(p => (
                                        <tr key={p.id}>
                                            <td>{new Date(p.issuedDate).toLocaleDateString()}</td>
                                            <td style={{ fontSize: '0.85rem' }}>{p.reason}</td>
                                            <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(p.amount)}</td>
                                            <td>
                                                <span className={`badge badge-${p.paidStatus === 'paid' ? 'success' : 'danger'}`}
                                                      style={p.paidStatus !== 'paid' ? { animation: 'pulse 2s infinite' } : {}}>
                                                    {p.paidStatus?.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {p.paidStatus !== 'paid' && systemSettings?.toggle_mpesa_integration !== 'false' && (
                                                    <button className="btn btn-accent btn-sm" 
                                                        onClick={() => {
                                                            navigate('/member/portal/payments');
                                                            setMpesaAllocations([{ type: 'Penalty', amount: p.amount.toString() }]);
                                                            setMpesaPhone(stats?.phone || '');
                                                        }}>
                                                        Pay via M-Pesa
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {penalties.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>Zero active penalties on your account. Well done!</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'Dividends':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>💰 My Dividends</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>View your shared prosperity payouts and download official receipts.</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Lifetime Dividends</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--success)' }}>{fmt(dividends.reduce((s, d) => s + d.amount, 0))}</div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--accent-dim)', borderRadius: '10px', border: '1px solid var(--accent-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Award className="text-accent" size={24} />
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>Institutional Dividend Policy</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Last updated by administration center</div>
                                    </div>
                                </div>
                                <button className="btn btn-accent btn-sm" onClick={() => setShowPolicy(true)}>View Policy Details</button>
                            </div>
                            
                            <div className="table-wrap" style={{ margin: '0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Payout Date</th>
                                            <th>Method</th>
                                            <th>Note</th>
                                            <th>Amount</th>
                                            <th style={{ textAlign: 'right' }}>Official Receipt</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dividends.length === 0 ? (
                                            <tr className="empty-row"><td colSpan="5" style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>No dividend distributions found in your history yet.</td></tr>
                                        ) : (
                                            dividends.map(d => (
                                                <tr key={d.id}>
                                                    <td style={{ fontWeight: 700 }}>{new Date(d.distributionDate).toLocaleDateString()}</td>
                                                    <td><span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>{d.calcMethod?.toUpperCase()}</span></td>
                                                    <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{d.note || '---'}</td>
                                                    <td style={{ fontWeight: 800, color: 'var(--success)' }}>{fmt(d.amount)}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button 
                                                            className="btn btn-ghost btn-sm" 
                                                            style={{ gap: '0.4rem', color: 'var(--accent)' }}
                                                            onClick={() => memberDownloadBlob(`/api/member/me/dividends/${d.id}/receipt.pdf`, `Dividend_Receipt_${d.dividendId}.pdf`)}
                                                        >
                                                            <Download size={14} /> PDF Receipt
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {showPolicy && (
                            <div className="modal-overlay" style={{ zIndex: 1100 }}>
                                <div className="modal-box" style={{ maxWidth: 600 }}>
                                    <div className="modal-header">
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Award className="text-accent" /> Financial Policy</h3>
                                        <button className="btn btn-ghost btn-icon" onClick={() => setShowPolicy(false)}>✕</button>
                                    </div>
                                    <div style={{ padding: '1rem 0', fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                                        {policyContent || 'The dividend policy is currently being updated by the administration. Please check back later.'}
                                    </div>
                                    <div className="modal-footer">
                                        <button className="btn btn-primary" onClick={() => setShowPolicy(false)}>I Understand</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'Resolutions':
                return (
                    <div className="grid grid-2">
                        {resolutions.map(r => (
                            <div key={r.id} className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>RESOLUTION #{r.id}</span>
                                    <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                                </div>
                                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>Meeting Resolution</h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{r.description || r.resolutionText || 'Official record of meeting resolution.'}</p>
                            </div>
                        ))}
                        {resolutions.length === 0 && <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>No official resolutions published yet.</div>}
                    </div>
                );
            case 'Apply for Loan':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Loan Calculator */}
                        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(16,185,129,0.05))', border: '1px solid rgba(99,102,241,0.2)' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>🧮 Loan Repayment Calculator</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Principal Amount (KES)</label>
                                    <input type="range" min={1000} max={stats?.availableLimit || 2000000} step={1000} value={calcAmount} onChange={e => setCalcAmount(Number(e.target.value))} style={{ width: '100%' }} />
                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--member-accent)', marginTop: '0.3rem' }}>KES {Number(calcAmount).toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Tenure (Months)</label>
                                    <input type="range" min={1} max={36} step={1} value={calcTenure} onChange={e => setCalcTenure(Number(e.target.value))} style={{ width: '100%' }} />
                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--member-accent)', marginTop: '0.3rem' }}>{calcTenure} months</div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Interest Rate (%)</label>
                                    <input type="range" min={0} max={20} step={0.5} value={calcRate} onChange={e => setCalcRate(Number(e.target.value))} style={{ width: '100%' }} />
                                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--member-accent)', marginTop: '0.3rem' }}>{calcRate}% p.m.</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                {[
                                    { label: 'Monthly Repayment', value: `KES ${calcMonthlyRepayment().toLocaleString()}`, color: 'var(--member-accent)' },
                                    { label: 'Total Interest', value: `KES ${calcInterest().toLocaleString()}`, color: '#f59e0b' },
                                    { label: 'Total Repayable', value: `KES ${calcTotal().toLocaleString()}`, color: 'var(--danger)' }
                                ].map(item => (
                                    <div key={item.label} style={{ padding: '1rem', background: 'var(--surface)', borderRadius: 10, textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>{item.label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Amortization Schedule Details */}
                            <div style={{ marginTop: '2rem' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>📅 Amortization Schedule</h4>
                                <div style={{ overflowX: 'auto', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Month</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Principal</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Interest</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Remaining Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {calcAmortizationSchedule().map((row, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.6rem 1rem' }}>{row.month}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--success)' }}>{Number(row.principalPayment).toLocaleString()}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: 'var(--warning)' }}>{Number(row.interestPayment).toLocaleString()}</td>
                                                    <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{Number(row.balance).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Application Form */}
                        <div className="card">
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>📋 Submit Loan Application</h3>
                            {loanMsg && <div className={`toast toast-${loanMsg.type}`} style={{ marginBottom: '1rem' }}>{loanMsg.text}</div>}
                            <form onSubmit={handleApplyLoan}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label>Loan Amount (KES) *</label>
                                        <input className="input" type="number" min="1000" required placeholder="e.g. 50000"
                                            value={loanForm.amount} onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))} />
                                        <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>Your available limit: {fmt(stats?.availableLimit || 0)}</span>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label>Repayment Tenure (Months) *</label>
                                        <select className="input" value={loanForm.tenure} onChange={e => setLoanForm(f => ({ ...f, tenure: e.target.value }))}>
                                            {[1,2,3,6,9,12,18,24,36].map(t => <option key={t} value={t}>{t} months</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Purpose / Reason *</label>
                                    <textarea className="input" required rows={3} placeholder="Briefly describe what this loan is for..."
                                        value={loanForm.reason} onChange={e => setLoanForm(f => ({ ...f, reason: e.target.value }))}
                                        style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={applyingLoan}>
                                    {applyingLoan ? '⏳ Submitting...' : '🚀 Submit Application'}
                                </button>
                            </form>
                        </div>

                        {/* Applications History */}
                        {loanApps.length > 0 && (
                            <div className="card" style={{ padding: 0 }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                                    <h4 style={{ margin: 0 }}>📜 My Applications</h4>
                                </div>
                                <div className="table-wrap">
                                    <table>
                                        <thead><tr><th>Amount</th><th>Tenure</th><th>Reason</th><th>Status</th><th>Date</th></tr></thead>
                                        <tbody>
                                            {loanApps.map((a, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 700, color: 'var(--member-accent)' }}>KES {Number(a.amount).toLocaleString()}</td>
                                                    <td>{a.tenure} months</td>
                                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason}</td>
                                                    <td>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: 20,
                                                            background: a.status === 'approved' ? 'rgba(16,185,129,0.1)' : a.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                                            color: a.status === 'approved' ? 'var(--success)' : a.status === 'rejected' ? 'var(--danger)' : '#f59e0b' }}>
                                                            {a.status === 'approved' ? '✅ Approved' : a.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(a.timestamp).toLocaleDateString('en-GB')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'Meetings':
                return (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={18} /> Meeting Schedule</h3>
                            <button className="btn btn-accent" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setShowScanner(true)}>
                                <Activity size={16} /> Scan QR to Check-in
                            </button>
                        </div>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date &amp; Time</th>
                                        <th>Subject / Title</th>
                                        <th>Type</th>
                                        <th>Attendance</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {meetings.length === 0 && (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                                                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📅</div>
                                                <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>Meeting Schedule Clear</h3>
                                                <p>No upcoming meetings are currently mandated for your account.</p>
                                            </td>
                                        </tr>
                                    )}
                                    {meetings.map((m, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 600 }}>{new Date(m.date).toLocaleString()}</td>
                                            <td>{m.title}</td>
                                            <td><span className="badge badge-warning">{m.meetingType || 'Regular'}</span></td>
                                            <td>
                                                <span className={`badge badge-${m.attended ? 'success' : 'danger'}`}>
                                                    {m.attended ? 'Present' : 'Absent'}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-ghost btn-icon" title="Download Minutes PDF"
                                                        onClick={() => memberDownloadBlob(`/api/meetings/${m.id}/minutes.pdf`, `Minutes_${m.id}.pdf`)}>
                                                        <FileText size={16} />
                                                    </button>
                                                    {m.attended && (
                                                        <button className="btn btn-ghost btn-icon" title="Download Attendance Action PDF"
                                                            style={{ color: 'var(--success)' }}
                                                            onClick={() => memberDownloadBlob(`/api/meetings/${m.id}/attendance-action.pdf`, `Attendance_Action_${m.id}.pdf`)}>
                                                            <FileCheck size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'Communications':
                return <Communications />;
            case 'Group Documents':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card shadow-sm" style={{ padding: '2rem', background: 'linear-gradient(135deg, var(--surface), rgba(99,102,241,0.02))' }}>
                            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                <div style={{ background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1rem', borderRadius: '16px' }}><Shield size={32} /></div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Group Records & Downloads</h2>
                                    <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Access official constitution, bylaws, and group-wide policy documents.</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-3">
                            {groupDocuments.length === 0 ? (
                                <div className="card" style={{ gridColumn: 'span 3', padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                                    <p>No group documents have been uploaded yet.</p>
                                </div>
                            ) : (
                                groupDocuments.map(doc => (
                                    <div key={doc.id} className="card shadow-sm hover-up" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: '4px' }}>
                                                    {doc.category || 'General'}
                                                </span>
                                                <FileText size={18} style={{ opacity: 0.5 }} />
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800 }}>{doc.title}</h4>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.4 }}>{doc.description || 'No description provided.'}</p>
                                        </div>
                                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                                                {new Date(doc.uploadDate).toLocaleDateString()}
                                            </div>
                                            <button 
                                                className="btn btn-ghost btn-sm" 
                                                style={{ gap: '0.4rem', fontSize: '0.75rem' }}
                                                onClick={() => memberDownloadBlob(`/api/documents/vault/${doc.filename}?download=true`, doc.title + '.pdf')}
                                            >
                                                <Download size={14} /> Download
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            case 'Communications':
                return <Communications type="member" />;
            case 'Announcements':
                return <Campaigns />;
            default:
                return (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        <AlertTriangle size={40} style={{ margin: '0 auto 1rem', display: 'block' }} />
                        View for "{activeTab}" is under scheduled maintenance. Please check back shortly.
                    </div>
                );
        }
    };

    const [showScanner, setShowScanner] = useState(false);
    const [groupDocuments, setGroupDocuments] = useState([]);

    const fetchDocuments = async () => {
        // Redundant - now handled in fetchAll
        fetchAll();
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
            {showScanner && <ScannerModal onClose={() => setShowScanner(false)} />}
            
            {/* Global Announcement Banner */}
            {systemSettings?.maintenanceMode && (
                <div style={{ background: 'var(--danger)', color: '#fff', padding: '0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, position: 'sticky', top: 0, zIndex: 1001 }}>
                    ⚠️ SYSTEM MAINTENANCE: {systemSettings.maintenanceMessage} (Resolution expected: {systemSettings.maintenanceResolution})
                </div>
            )}
            
            {systemSettings?.global_announcement && !systemSettings?.maintenanceMode && (
                <div style={{ 
                    background: 'var(--accent)', 
                    color: '#fff', 
                    padding: '0.6rem 1rem', 
                    fontSize: '0.8rem', 
                    fontWeight: 700, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.75rem',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1001,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}>
                    <Bell size={14} className="pulse" />
                    <span>{systemSettings.global_announcement}</span>
                    {systemSettings?.announcement_link && (
                        <a href={systemSettings.announcement_link} target="_blank" style={{ color: '#fff', textDecoration: 'underline', marginLeft: '0.5rem' }}>View Details</a>
                    )}
                </div>
            )}

            <nav style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: systemSettings?.global_announcement || systemSettings?.maintenanceMode ? '34px' : 0, zIndex: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--accent)', color: '#fff', width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>L</div>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>LLUCG <span style={{ color: 'var(--text-dim)', fontWeight: 500, fontSize: '0.8rem' }}>PORTAL</span></span>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button 
                        className="btn btn-ghost btn-icon" 
                        style={{ position: 'relative' }}
                        onClick={() => navigate('/member/portal/notifications')}
                    >
                        <Bell size={18} />
                        {notifications.filter(n => !n.isRead).length > 0 && (
                            <span style={{ 
                                position: 'absolute', top: 0, right: 0, 
                                width: 8, height: 8, background: 'var(--danger)', 
                                borderRadius: '50%', border: '2px solid var(--surface)' 
                            }} />
                        )}
                    </button>
                    {systemSettings?.allow_user_theme_toggle === 'true' && (
                        <button className="btn btn-ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    )}
                    <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--accent)' }}>
                        {stats?.name?.charAt(0) || 'M'}
                    </div>
                </div>
            </nav>

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem' }}>


            {/* ── Status Banners ── */}
            {stats?.registration_fee_paid === 0 && (
                <div style={{ 
                    background: 'rgba(234, 179, 8, 0.1)', 
                    border: '1px solid rgba(234, 179, 8, 0.2)', 
                    borderRadius: '16px', 
                    padding: '1.25rem', 
                    marginBottom: '2rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1.25rem',
                    boxShadow: '0 4px 12px rgba(234, 179, 8, 0.1)'
                }}>
                    <div style={{ 
                        width: '48px', 
                        height: '48px', 
                        borderRadius: '12px', 
                        background: 'rgba(234, 179, 8, 0.2)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: '#eab308'
                    }}>
                        <ShieldAlert size={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#eab308', letterSpacing: '0.01em' }}>REGISTRATION FEE PENDING</h4>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Your membership registration has not been fully verified. Please settle your registration fee to activate all portal privileges and ensure full compliance.
                        </p>
                    </div>
                </div>
            )}

            {/* Primary Stats Row */}

                {/* Content Area */}
                {renderTabContent()}

                {/* MFA Modal */}
                {mfaChallenge && (
                    <div className="modal-overlay" style={{ zIndex: 2000 }}>
                        <div className="modal-box" style={{ maxWidth: 400 }}>
                            <div className="modal-header">
                                <h3>🛡️ Security Verification</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setMfaChallenge(null)}>✕</button>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                {mfaChallenge.message} Code sent to <strong>{mfaChallenge.phoneMasked}</strong>.
                            </p>
                            <div className="form-group">
                                <label>Verification Code</label>
                                <input 
                                    className="input" 
                                    type="text" 
                                    placeholder="Enter 6-digit code" 
                                    value={mfaCode} 
                                    onChange={e => setMfaCode(e.target.value)}
                                    style={{ fontSize: '1.25rem', textAlign: 'center', letterSpacing: '0.2em' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <button 
                                    className="btn btn-primary" 
                                    style={{ width: '100%' }}
                                    onClick={() => mfaChallenge.onConfirm(mfaCode)}
                                    disabled={mfaCode.length < 4 || applyingLoan}
                                >
                                    {applyingLoan ? 'Verifying...' : 'Authorize Transaction'}
                                </button>
                                <button 
                                    className="btn btn-ghost" 
                                    style={{ fontSize: '0.75rem' }}
                                    onClick={requestMfaCode}
                                    disabled={requestingMfa}
                                >
                                    {requestingMfa ? 'Sending...' : "Didn't get code? Resend SMS"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {history && (
                    <div className="modal-overlay" onClick={() => setHistory(null)} style={{ zIndex: 3500 }}>
                        <div className="modal-box" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Clock className="text-accent" /> Repayment History</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setHistory(null)}>✕</button>
                            </div>
                            <div style={{ padding: '0.5rem' }}>
                                <div className="table-wrap" style={{ maxHeight: 400 }}>
                                    <table>
                                        <thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th style={{ textAlign: 'right' }}>Receipt</th></tr></thead>
                                        <tbody>
                                            {loans.find(l => l.id === history.id)?.repayments?.length === 0 ? <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No repayments recorded yet.</td></tr> : (loans.find(l => l.id === history.id)?.repayments || []).map(r => (
                                                <tr key={r.id}>
                                                    <td>{new Date(r.paidDate).toLocaleDateString()}</td>
                                                    <td>{r.reference || '—'}</td>
                                                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt(r.amount)}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button className="btn btn-ghost btn-icon" title="Download Receipt" onClick={() => memberDownloadBlob(`/api/member/me/loan-repayments/${r.id}/receipt.pdf`, `Receipt_${r.reference || r.id}.pdf`)}>
                                                            <FileText size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showKycModal && (
                    <div className="modal-overlay" style={{ zIndex: 3000 }}>
                        <div className="modal-box" style={{ maxWidth: 450 }}>
                            <div className="modal-header">
                                <h3>📂 Upload KYC Document</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowKycModal(false)}>✕</button>
                            </div>
                            <div style={{ padding: '1rem 0' }}>
                                <div className="form-group">
                                    <label>Document Type</label>
                                    <select className="input" value={kycForm.type} onChange={e => setKycForm({...kycForm, type: e.target.value})}>
                                        <option value="National ID">National ID</option>
                                        <option value="Passport">Passport</option>
                                        <option value="Passport Photo">Passport Photo</option>
                                        <option value="Proof of Address">Proof of Address</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Select File</label>
                                    <input type="file" className="input" onChange={e => setKycForm({...kycForm, file: e.target.files[0]})} />
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>Supported formats: JPG, PNG, PDF. Max 5MB.</p>
                                </div>
                                <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem' }}>
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ flex: 1 }} 
                                        disabled={!kycForm.file || uploadingKyc}
                                        onClick={async () => {
                                            setUploadingKyc(true);
                                            try {
                                                const formData = new FormData();
                                                formData.append('file', kycForm.file);
                                                formData.append('documentType', kycForm.type);
                                                const r = await memberFetch('/api/member/me/documents', {
                                                    method: 'POST',
                                                    body: formData
                                                });
                                                if (r.ok) {
                                                    alert('Document uploaded successfully!');
                                                    setShowKycModal(false);
                                                    setKycForm({ type: 'National ID', file: null });
                                                    fetchAll();
                                                } else {
                                                    const d = await r.json();
                                                    alert(d.error || 'Upload failed');
                                                }
                                            } catch (e) { alert(e.message); }
                                            setUploadingKyc(false);
                                        }}
                                    >
                                        {uploadingKyc ? 'Uploading...' : 'Confirm Upload'}
                                    </button>
                                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowKycModal(false)}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MemberPortal;
