import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    LayoutDashboard, Users, CreditCard, RefreshCw, Activity, 
    LogOut, Sun, Moon, Calendar, FileUp, Home, PiggyBank,
    Banknote, FileCheck, AlertTriangle, Handshake, TrendingUp, Receipt,
    Settings as SettingsIcon, FileText, PieChart, Shield, ShieldCheck, ChevronLeft, ChevronRight,
    Map, Info, CheckCircle, Briefcase, Gavel, MessageSquare, Megaphone, Menu, Bell, Award, History, ShieldAlert, CheckCircle2, Zap, Heart, Star, Layout as LayoutIcon, Smartphone
} from 'lucide-react';
import { getToken, clearToken, clearUsername, clearRole, getUsername, getRole,
         getMemberToken, getMemberName, clearMemberToken, clearMemberName, getRoleLabel } from './utils/api';
import logo from './assets/logo.png';
import Dashboard  from './components/Dashboard';
import Members    from './components/Members';
import Payments   from './components/Payments';
import Reports    from './pages/Reports';
import Login      from './pages/Login';
import SystemControl from './pages/SystemControl';
import Settings   from './pages/Settings';
import Loans      from './pages/Loans';
import Penalties  from './pages/Penalties';
import Meetings   from './pages/Meetings';
import MemberLogin  from './pages/MemberLogin';
import MemberPortal from './pages/MemberPortal';
import Registration from './pages/Registration';
import Investments       from './pages/Investments';
import Polls             from './pages/Polls';
import Communications    from './pages/Communications';
import Campaigns         from './pages/Campaigns';
import NotificationsPage from './pages/Notifications';
import Expenses          from './pages/Expenses';
import DocumentVault     from './pages/DocumentVault';
import MyUploads         from './pages/MyUploads';
import Reconciliation    from './pages/Reconciliation';
import Savings         from './pages/Savings';
import MemberLifecycle from './pages/MemberLifecycle';
import LoanApplications from './pages/LoanApplications';
import Pledges          from './pages/Pledges';
import VerificationPage from './pages/VerificationPage';
import NotificationBell from './components/NotificationBell';
import AnnouncementBanner from './components/AnnouncementBanner';
import Forbidden from './pages/Forbidden';
import Dividends from './pages/Dividends';
import ChangePassword from './pages/ChangePassword';
import RiskManagement from './pages/RiskManagement';
import Withdrawals    from './pages/Withdrawals';
import FinancialGovernance from './pages/FinancialGovernance';

// ── Role Helpers ─────────────────────────────────────────────
const isSuperRole = (role) => role?.toLowerCase() === 'superadmin';
const isICTRole = (role) => ['superadmin', 'ict_admin'].includes(role?.toLowerCase());
const isFinanceRole = (role) => ['superadmin', 'finance_admin', 'treasurer', 'ict_admin'].includes(role?.toLowerCase());
const isSecretaryRole = (role) => ['superadmin', 'admin', 'secretary', 'ict_admin', 'staff'].includes(role?.toLowerCase());
const isAnyAdmin = (role) => ['superadmin', 'admin', 'finance_admin', 'treasurer', 'secretary', 'ict_admin', 'staff'].includes(role?.toLowerCase());

// ── Sidebar Visibility Logic ─────────────────────────────────
const canSeeFinancials = (role) => isFinanceRole(role) || role?.toLowerCase() === 'admin';
const canSeeGovernance = (role) => isSecretaryRole(role) || role?.toLowerCase() === 'admin';
const canSeeICT        = (role) => isICTRole(role);
const canSeeExpenses   = (role) => isFinanceRole(role);
const canSeeSettings   = (role) => isSuperRole(role) || isICTRole(role) || role?.toLowerCase() === 'admin';

// ── Dynamic RBAC helper ────────────────────────────────────────
// Reads ICT-saved overrides (rbac_{role}_{key}) from features.
// Falls back to the role-default logic if no override is stored yet.
const canAccess = (role, features, key, defaultFn) => {
    const r = role?.toLowerCase();
    if (r === 'superadmin') return true;
    const settingKey = `rbac_${r}_${key}`;
    if (features && features[settingKey] !== undefined) {
        return features[settingKey] === 'true';
    }
    return defaultFn ? defaultFn(role) : true;
};

// ── Route Guards ──────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
    const token = getToken();
    const role = getRole()?.toLowerCase();
    const location = useLocation();
    
    if (!token) return <Navigate to="/login" replace />;

    const mustChange = localStorage.getItem('mustChangePassword') === 'true';
    if (mustChange && location.pathname !== '/change-password') {
        return <Navigate to="/change-password" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/forbidden" replace />;
    return children;
};
const MemberRoute = ({ children }) => {
    const token = getMemberToken();
    const location = useLocation();
    
    if (!token) return <Navigate to="/member/login" replace />;

    const mustChange = localStorage.getItem('member_must_change_password') === 'true';
    if (mustChange && location.pathname !== '/member/change-password') {
        return <Navigate to="/member/change-password" replace />;
    }

    return children;
};

const RootRedirect = () => {
    const adminToken = getToken();
    const memberToken = getMemberToken();
    const role       = getRole();

    if (adminToken) {
        if (role === 'ict_admin') return <Navigate to="/system-control" replace />;
        return <Navigate to="/dashboard" replace />;
    }
    
    if (memberToken) return <Navigate to="/member/portal" replace />;

    return <Navigate to="/login" replace />;
};

// ── Layout Component ─────────────────────────────────────────
const Layout = ({ children, type = 'admin' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const role     = getRole();
    const username = getUsername() || getMemberName();

    console.log('Sidebar Rendering:', { type, role, username });

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
    const [collapsed, setCollapsed] = useState(() => {
        const val = localStorage.getItem('sidebar_collapsed');
        if (window.innerWidth <= 768) return true;
        return val === 'true'; // Default to false (expanded)
    });
    const [isHovered, setIsHovered] = useState(false);
    const [features, setFeatures] = useState({});
    const [prevNotifCount, setPrevNotifCount] = useState(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/system/status');
            if (res.ok) {
                const data = await res.json();
                const newFeatures = data.features || {};
                setFeatures(newFeatures);
                localStorage.setItem('system_features', JSON.stringify(newFeatures));

                if (newFeatures.allow_user_theme_toggle === 'true') {
                    const localTheme = localStorage.getItem('theme');
                    if (localTheme) {
                        setTheme(localTheme);
                    } else if (newFeatures.theme_light_mode !== undefined) {
                        setTheme(newFeatures.theme_light_mode === 'true' ? 'light' : 'dark');
                    }
                } else {
                    if (newFeatures.theme_light_mode !== undefined) {
                        setTheme(newFeatures.theme_light_mode === 'true' ? 'light' : 'dark');
                    }
                }

                // ── Feature 4: Dynamic Theming ──────────────────────────────
                if (newFeatures.brand_accent) {
                    document.documentElement.style.setProperty('--accent', newFeatures.brand_accent);
                    document.documentElement.style.setProperty('--accent-hover', newFeatures.brand_accent);
                    document.documentElement.style.setProperty('--accent-dim', newFeatures.brand_accent + '22');
                }
                if (newFeatures.brand_member_accent) {
                    document.documentElement.style.setProperty('--member-accent', newFeatures.brand_member_accent);
                    document.documentElement.style.setProperty('--member-accent-dim', newFeatures.brand_member_accent + '1A');
                }

                // ── Feature 2: Push Notifications ────────────────────────────
                if (newFeatures.notif_count !== undefined && 'Notification' in window) {
                    const currentCount = parseInt(newFeatures.notif_count) || 0;
                    if (prevNotifCount !== null && currentCount > prevNotifCount && Notification.permission === 'granted') {
                        new Notification('LLUCG Portal', {
                            body: `You have ${currentCount - prevNotifCount} new alert${currentCount - prevNotifCount > 1 ? 's' : ''}. Open the portal to view.`,
                            icon: '/favicon.png'
                        });
                    }
                    setPrevNotifCount(currentCount);
                }
            }
        } catch (e) { console.error('Status fetch error:', e); }
    }, [prevNotifCount]);

    useEffect(() => {
        fetchStatus();
        const id = setInterval(fetchStatus, 30000);
        return () => clearInterval(id);
    }, [fetchStatus]);

    // ── Feature 2: Request Push Notification Permission on mount ────
    useEffect(() => {
        const notifPref = localStorage.getItem('notif_enabled');
        if (notifPref === null || notifPref === 'true') {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }
    }, []);

    const isEnabled = (key, def = true) => {
        if (!features || Object.keys(features).length === 0) return def;
        if (features[key] === undefined) return def;
        return features[key] === 'true';
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('sidebar_collapsed', collapsed);
    }, [collapsed]);

    const logout = () => { 
        if (type === 'member') {
            clearMemberToken(); clearMemberName(); navigate('/member/login'); 
        } else {
            clearToken(); clearUsername(); clearRole(); navigate('/login'); 
        }
    };

    const getIcon = (name, Fallback) => {
        const Icons = { CreditCard, Banknote, PiggyBank, TrendingUp, Users, Calendar, Shield, Zap, Heart, Star, LayoutDashboard, FileCheck, Award, MessageSquare, ShieldCheck, FileText, Smartphone, AlertTriangle, RefreshCw, Receipt, Megaphone, PieChart, ShieldAlert, History, Settings: SettingsIcon, Bell, Layout: LayoutIcon };
        return Icons[name] || Fallback;
    };

    const navItem = (to, label, Icon, exact=false, customIconName=null) => {
        const FinalIcon = customIconName ? getIcon(customIconName, Icon) : Icon;
        return (
            <NavLink to={to} end={exact} className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>
                <FinalIcon size={20} /> <span>{label}</span>
            </NavLink>
        );
    };

    const isAdmin = type === 'admin';
    const isMember = type === 'member';
    
    // Sidebar visually collapses only if it has been toggled closed AND the user is not actively hovering over it.
    const isVisuallyCollapsed = collapsed && !isHovered;

    return (
        <div className={`app-layout ${isMember ? 'member-theme' : ''}`}>
            <aside 
                className={`sidebar ${isVisuallyCollapsed ? 'sidebar-collapsed' : ''}`}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                
                <div className="sidebar-header" style={{ position: 'relative' }}>
                                        <div className="sidebar-logo" style={{ opacity: isVisuallyCollapsed ? 0 : 1, transition: 'opacity 0.2s', pointerEvents: isVisuallyCollapsed ? 'none' : 'auto' }}>
                        <div className="brand-logo-container">
                            <img src={logo} className="logo-img" alt="Logo" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'normal', lineHeight: 1.1 }}>
                                {features.organization_name || 'LIFE-LONG UNITY'}
                            </div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>
                                {isMember ? <>Member <br/> Portal</> : <>Admin <br/> Control</>}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setCollapsed(!collapsed)} 
                            className="hamburger-btn"
                            style={{ 
                                position: 'absolute', 
                                right: isVisuallyCollapsed ? '50%' : '1.5rem', 
                                transform: isVisuallyCollapsed ? 'translateX(50%)' : 'none',
                                background: 'transparent', 
                                border: 'none', 
                                color: 'var(--text-secondary)', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'all 0.3s ease',
                                padding: '4px'
                            }}>
                        <Menu size={26} />
                    </button>
                </div>

                <div className="sidebar-nav">
                    {isAdmin && isAnyAdmin(role) && (
                        <>
                            <div className="sidebar-section">{features.label_sidebar_main || 'Main Menu'}</div>
                            {navItem("/dashboard", features.ui_label_admin_dashboard || "Dashboard", LayoutDashboard, true, features.ui_icon_admin_dashboard)}
                            
                             <div className="sidebar-section">{features.label_sidebar_financials || 'Financial Desk'}</div>
                             {canSeeFinancials(role) && navItem("/member-lifecycle", "Member Lifecycle Intelligence", Activity)}
                             {canAccess(role, features, 'payments', canSeeFinancials) && (
                                 <>
                                     {isEnabled('toggle_admin_payments') && navItem("/payments", features.ui_label_admin_payments || "Payments", CreditCard, false, features.ui_icon_admin_payments)}
                                     {isEnabled('toggle_admin_reconciliation') && navItem("/reconcile", features.ui_label_admin_reconciliation || "Reconcile", RefreshCw, false, features.ui_icon_admin_reconciliation)}
                                 </>
                             )}
                             {canAccess(role, features, 'savings', canSeeFinancials) && isEnabled('toggle_admin_savings') && navItem("/savings", features.ui_label_admin_savings || "Savings", PiggyBank, false, features.ui_icon_admin_savings)}
                             {canAccess(role, features, 'savings', canSeeFinancials) && isEnabled('toggle_admin_savings') && navItem("/withdrawals", features.ui_label_admin_withdrawals || "Payouts", Banknote, false, features.ui_icon_admin_withdrawals)}
                            {canAccess(role, features, 'loans', canSeeFinancials) && isEnabled('toggle_admin_loans') && (
                                <>
                                    {navItem("/loans", features.ui_label_admin_loans || "Loans", Banknote, false, features.ui_icon_admin_loans)}
                                    {navItem("/loan-apps", features.ui_label_admin_loan_apps || "Loan Applications", FileCheck, false, features.ui_icon_admin_loan_apps)}
                                </>
                            )}
                            {canAccess(role, features, 'penalties', canSeeFinancials) && isEnabled('toggle_admin_payments') && navItem("/penalties", features.ui_label_admin_penalties || "Penalties", AlertTriangle, false, features.ui_icon_admin_penalties)}
                            {canAccess(role, features, 'pledges', canSeeFinancials) && isEnabled('toggle_admin_pledges') && navItem("/pledges", features.ui_label_admin_pledges || "Pledges", Handshake, false, features.ui_icon_admin_pledges)}
                            {canAccess(role, features, 'investments', canSeeFinancials) && isEnabled('toggle_admin_investments') && navItem("/investments", features.ui_label_admin_investments || "Investments", TrendingUp, false, features.ui_icon_admin_investments)}
                            {canAccess(role, features, 'expenses', canSeeExpenses) && isEnabled('toggle_admin_expenses') && navItem("/expenses", features.ui_label_admin_expenses || "Expenses", Receipt, false, features.ui_icon_admin_expenses)}
                            {canAccess(role, features, 'dividends', canSeeFinancials) && navItem("/dividends", features.ui_label_admin_dividends || "Dividends", Award, false, features.ui_icon_admin_dividends)}
                            {canAccess(role, features, 'financial_governance', canSeeFinancials) && navItem("/financial-governance", "Financial Governance", Banknote)}
                            
                            <div className="sidebar-section">{features.label_sidebar_governance || 'Governance & Reports'}</div>
                            {canAccess(role, features, 'members', canSeeGovernance) && isEnabled('toggle_admin_members') && navItem("/members", features.ui_label_admin_members || "Members", Users, false, features.ui_icon_admin_members)}
                            {canAccess(role, features, 'meetings', canSeeGovernance) && isEnabled('toggle_admin_meetings') && navItem("/meetings", features.ui_label_admin_meetings || "Meetings", Calendar, false, features.ui_icon_admin_meetings)}
                            {canAccess(role, features, 'communications', canSeeGovernance) && isEnabled('toggle_admin_communications') && navItem("/communications", features.ui_label_admin_communications || "Communications", MessageSquare, false, features.ui_icon_admin_communications)}
                            {canAccess(role, features, 'campaigns', canSeeGovernance) && isEnabled('toggle_admin_campaigns') && navItem("/campaigns", features.ui_label_admin_campaigns || "Campaigns", Megaphone, false, features.ui_icon_admin_campaigns)}
                            {canAccess(role, features, 'polls', canSeeGovernance) && isEnabled('toggle_admin_polls') && navItem("/polls", features.ui_label_admin_polls || "Polls", PieChart, false, features.ui_icon_admin_polls)}
                            {canAccess(role, features, 'reports', () => true) && isEnabled('toggle_admin_reports') && navItem("/reports", features.ui_label_admin_reports || "Reports", FileText, false, features.ui_icon_admin_reports)}
                            
                            <div className="sidebar-section">Intelligence & Support</div>
                            {canAccess(role, features, 'risk', canSeeICT) && navItem("/risk-management", features.ui_label_admin_risk || "Risk Intelligence", ShieldCheck, false, features.ui_icon_admin_risk)}
                            {canAccess(role, features, 'logs', canSeeICT) && navItem("/system-control?tab=audit", features.ui_label_admin_logs || "Audit Trail", History, false, features.ui_icon_admin_logs)}
                            
                            <div className="sidebar-section">{features.label_sidebar_system || 'System'}</div>
                            {canAccess(role, features, 'system', canSeeICT) && navItem("/system-control", features.ui_label_admin_settings || "System Control", Shield, false, features.ui_icon_admin_settings)}
                            {canAccess(role, features, 'security', canSeeICT) && navItem("/system-control?tab=admins", features.ui_label_admin_security || "Security Center", ShieldCheck, false, features.ui_icon_admin_security)}
                            {canAccess(role, features, 'system', canSeeICT) && navItem("/system-control?tab=rate-limits", "Rate Limits", Zap)}
                            {canAccess(role, features, 'settings', canSeeSettings) && navItem("/settings", "General Settings", SettingsIcon)}
                            {navItem("/notifications", "Notifications", Bell)}
                        </>
                    )}

                    {isMember && (
                        <>
                            <div className="sidebar-section">Main Menu</div>
                            {navItem("/member/portal/overview", features.ui_label_member_dashboard || "Overview", LayoutDashboard, true, features.ui_icon_member_dashboard)}
                            {navItem("/member/portal/profile", "Profile Settings", SettingsIcon)}
                            {navItem("/member/notifications", "Notifications", Bell)}
                            
                            <div className="sidebar-section">{features.label_sidebar_community || 'Community'}</div>
                            {isEnabled('toggle_member_support') && navItem("/member/portal/communications", features.ui_label_member_support || "Communications", MessageSquare, false, features.ui_icon_member_support)}
                            {isEnabled('toggle_member_polls') && navItem("/member/portal/polls", features.ui_label_member_polls || "Polls", PieChart, false, features.ui_icon_member_polls)}
                            {isEnabled('toggle_member_campaigns') && navItem("/member/portal/campaigns", "Announcements", Megaphone)}
                            {isEnabled('toggle_member_meetings') && navItem("/member/portal/meetings", features.ui_label_member_meetings || "Meetings", Calendar, false, features.ui_icon_member_meetings)}
                            
                            <div className="sidebar-section">{features.label_sidebar_member_financials || 'Financials'}</div>
                            {isEnabled('toggle_member_loans') && navItem("/member/portal/apply-for-loan", features.ui_label_member_apply_loan || "Apply for Loan", FileCheck, false, features.ui_icon_member_apply_loan)}
                            {isEnabled('toggle_member_pledges') && navItem("/member/portal/pledges", features.ui_label_member_pledges || "Pledges", Handshake, false, features.ui_icon_member_pledges)}
                            {isEnabled('toggle_member_guarantors') && navItem("/member/portal/guarantors", features.ui_label_member_guarantors || "Guarantors", Shield, false, features.ui_icon_member_guarantors)}
                            {isEnabled('toggle_member_payments') && navItem("/member/portal/payments", features.ui_label_member_payments || "Payments", CreditCard, false, features.ui_icon_member_payments)}
                            {isEnabled('toggle_member_loans') && navItem("/member/portal/loans", features.ui_label_member_loans || "Loans", Banknote, false, features.ui_icon_member_loans)}
                            {isEnabled('toggle_member_penalties') && navItem("/member/portal/penalties", features.ui_label_member_penalties || "Penalties", AlertTriangle, false, features.ui_icon_member_penalties)}
                            {isEnabled('toggle_member_resolutions') && navItem("/member/portal/resolutions", features.ui_label_member_resolutions || "Resolutions", Gavel, false, features.ui_icon_member_resolutions)}
                            
                            <div className="sidebar-section">{features.label_sidebar_records || 'Records & Downloads'}</div>
                            {isEnabled('toggle_member_documents') && navItem("/member/portal/group-documents", features.ui_label_member_docs || "Documents", FileText, false, features.ui_icon_member_docs)}
                        </>
                    )}
                    
                    {!isMember && navItem("/my-uploads", "My Uploads", FileUp)}
                </div>

                <div className="sidebar-footer">
                    <div className="user-section">
                        <div className="user-avatar" title={role}>
                            {username?.charAt(0).toUpperCase()}
                        </div>
                        {!isVisuallyCollapsed && (
                            <div style={{ overflow: 'hidden', flex: 1, paddingLeft: '0.25rem' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{username}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{isMember ? 'Member' : getRoleLabel(role, features)}</div>
                            </div>
                        )}
                        {features.allow_user_theme_toggle === 'true' && (
                            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="btn-icon-min" title="Toggle Theme" style={{ padding: '6px', opacity: 0.7, marginLeft: 'auto' }}>
                                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                            </button>
                        )}
                    </div>
                    
                    <button onClick={logout} className="logout-btn-premium" title="Sign Out Securely">
                        <LogOut size={18} />
                        {!isVisuallyCollapsed && <span style={{ fontWeight: 800 }}>SIGN OUT</span>}
                    </button>
                </div>
            </aside>

            <div className="main-wrapper">
                <header className="top-bar">
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {isMember ? 'MEMBER DASHBOARD' : 'ADMINISTRATION CENTER'}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <NotificationBell type={isMember ? 'member' : 'admin'} />
                        
                        {features.allow_user_theme_toggle === 'true' && (
                            <button
                                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                                className="btn btn-ghost btn-sm"
                                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-secondary)', transition: '0.2s' }}
                            >
                                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            </button>
                        )}


                        {/* High Discovery Logout Button in Header */}
                        <button onClick={logout} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontWeight: 700, gap: '0.5rem', border: '1px solid currentColor', padding: '6px 12px', borderRadius: '4px' }}>
                            <LogOut size={16} /> Sign Out
                        </button>
                    </div>
                </header>
                <main className="main-content">
                    <AnnouncementBanner features={features} />
                    <AnimatePresence mode="wait">
                        <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};

// ── App Component ────────────────────────────────────────────
const App = () => (
    <BrowserRouter>
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
            <Route path="/member/login" element={<MemberLogin />} />
            <Route path="/member/register" element={<Registration />} />
            <Route path="/member" element={<Navigate to="/member/portal/overview" replace />} />
            <Route path="/member/portal" element={<Navigate to="/member/portal/overview" replace />} />
            <Route path="/member/portal/:tab" element={<MemberRoute><Layout type="member"><MemberPortal /></Layout></MemberRoute>} />
            <Route path="/member/notifications" element={<MemberRoute><Layout type="member"><NotificationsPage type="member" /></Layout></MemberRoute>} />
            <Route path="/member/change-password" element={<MemberRoute><ChangePassword /></MemberRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/members" element={<ProtectedRoute><Layout><Members /></Layout></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute><Layout><Payments /></Layout></ProtectedRoute>} />
            <Route path="/reconcile" element={<ProtectedRoute><Layout><Reconciliation /></Layout></ProtectedRoute>} />
            <Route path="/savings" element={<ProtectedRoute><Layout><Savings /></Layout></ProtectedRoute>} />
            <Route path="/member-lifecycle" element={<ProtectedRoute><Layout><MemberLifecycle /></Layout></ProtectedRoute>} />
            <Route path="/withdrawals" element={<ProtectedRoute><Layout><Withdrawals /></Layout></ProtectedRoute>} />
            <Route path="/loans" element={<ProtectedRoute><Layout><Loans /></Layout></ProtectedRoute>} />
            <Route path="/loan-apps" element={<ProtectedRoute><Layout><LoanApplications /></Layout></ProtectedRoute>} />
            <Route path="/penalties" element={<ProtectedRoute><Layout><Penalties /></Layout></ProtectedRoute>} />
            <Route path="/pledges" element={<ProtectedRoute><Layout><Pledges /></Layout></ProtectedRoute>} />
            <Route path="/investments" element={<ProtectedRoute allowedRoles={['superadmin', 'finance_admin', 'treasurer', 'ict_admin']}><Layout><Investments /></Layout></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute allowedRoles={['superadmin', 'finance_admin', 'treasurer', 'ict_admin']}><Layout><Expenses /></Layout></ProtectedRoute>} />
            <Route path="/dividends" element={<ProtectedRoute allowedRoles={['superadmin', 'finance_admin', 'treasurer', 'ict_admin']}><Layout><Dividends /></Layout></ProtectedRoute>} />
            <Route path="/my-uploads" element={<ProtectedRoute><Layout><MyUploads /></Layout></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage type="admin" /></Layout></ProtectedRoute>} />
            <Route path="/meetings" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'secretary', 'ict_admin', 'staff']}><Layout><Meetings /></Layout></ProtectedRoute>} />
            <Route path="/communications" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'secretary', 'ict_admin', 'staff']}><Layout><Communications /></Layout></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'secretary', 'ict_admin']}><Layout><Campaigns /></Layout></ProtectedRoute>} />
            <Route path="/polls" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'secretary', 'ict_admin']}><Layout><Polls /></Layout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Layout><Reports /></Layout></ProtectedRoute>} />
            <Route path="/system-control" element={<ProtectedRoute allowedRoles={['superadmin', 'ict_admin', 'finance_admin', 'treasurer']}><Layout><SystemControl /></Layout></ProtectedRoute>} />
            <Route path="/risk-management" element={<ProtectedRoute allowedRoles={['superadmin', 'ict_admin', 'finance_admin']}><Layout><RiskManagement /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'ict_admin']}><Layout><Settings /></Layout></ProtectedRoute>} />
            <Route path="/financial-governance" element={<ProtectedRoute allowedRoles={['superadmin', 'finance_admin', 'treasurer', 'ict_admin']}><Layout><FinancialGovernance /></Layout></ProtectedRoute>} />
            <Route path="/forbidden" element={<Forbidden />} />
            <Route path="/verify/:membershipNumber" element={<VerificationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </BrowserRouter>
);

export default App;
