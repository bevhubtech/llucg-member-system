require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

process.on('uncaughtException', (err) => {
    console.error('FATAL EXCEPTION:', err);
    try { fs.appendFileSync('fatal_errors.log', `${new Date().toISOString()} - EXCEPTION: ${err.stack}\n`); } catch(e){}
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    try { fs.appendFileSync('fatal_errors.log', `${new Date().toISOString()} - REJECTION: ${reason}\n`); } catch(e){}
});
const { PORT } = require('./config');
const { initCrons } = require('./crons/financials');
const { authRequired, memberAuthRequired } = require('./middleware/auth');
const maintenanceMiddleware = require('./middleware/maintenance');
const sanitizeInput = require('./middleware/sanitizer');

// --- Create Server ---
const app = express();
app.set('trust proxy', 1);

// --- Middleware ---
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(sanitizeInput);
app.use(morgan('dev'));

// --- Dynamic Rate Limiting ---
const { fetchSetting } = require('./utils/helpers');
let rateLimitConfig = {
    global: 5000,
    auth: 500
};

const syncRateLimits = async () => {
    try {
        const g = await fetchSetting('rate_limit_global', '5000');
        const a = await fetchSetting('rate_limit_auth', '500');
        rateLimitConfig.global = parseInt(g);
        rateLimitConfig.auth = parseInt(a);
        console.log(`[RateLimit] Synced: Global=${rateLimitConfig.global}, Auth=${rateLimitConfig.auth}`);
    } catch (e) {
        console.error('Failed to sync rate limits:', e.message);
    }
};
syncRateLimits();
setInterval(syncRateLimits, 60000); // Sync every minute

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: (req, res) => rateLimitConfig.global,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: (req, res) => rateLimitConfig.auth,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Export sync function for manual trigger
app.set('syncRateLimits', syncRateLimits);

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/member/login', authLimiter);
app.use('/api/member/register', authLimiter);
app.use('/api/member/reset-password', authLimiter);

// --- Static Folders ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Service Worker ---
app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const swPath = path.resolve(__dirname, '../frontend/public/sw.js');
    if (!fs.existsSync(swPath)) return res.status(404).send('Not found');
    res.sendFile(swPath);
});

// --- API Routes ---
const systemRouter = require('./routes/system');
const reportsRouter = require('./routes/reports');
const budgetsRouter = require('./routes/budgets');
const transactionsRouter = require('./routes/transactions');
const adminAuthRouter = require('./routes/adminAuth');
const membersRouter = require('./routes/members');
const exportsRouter = require('./routes/exports');
const expensesRouter = require('./routes/expenses');
const ictRouter = require('./routes/ict');
const riskRouter = require('./routes/risk');
const supportRouter = require('./routes/support');

app.use('/api/auth', adminAuthRouter);
app.use('/api/member', maintenanceMiddleware, require('./routes/memberAuth'));
app.use('/api/member/me', memberAuthRequired, maintenanceMiddleware, require('./routes/memberPortal'));
app.use('/api/member/me/beneficiaries', require('./routes/beneficiaries'));
app.use('/api/member/guarantors', memberAuthRequired, maintenanceMiddleware, require('./routes/loan_guarantors'));
app.use('/api/mpesa', require('./routes/mpesa'));
app.use('/api/members', authRequired, maintenanceMiddleware, membersRouter);
app.use('/api', transactionsRouter);
app.use('/api', require('./routes/governance'));
app.use('/api/reports', reportsRouter);
app.use('/api/stats', reportsRouter);
app.use('/api/export', exportsRouter);
app.use('/api/finance', budgetsRouter);
app.use('/api/expenses', authRequired, expensesRouter);
app.use('/api/risk', authRequired, riskRouter);
app.use('/api/support', supportRouter);
app.use('/api/system', systemRouter);

// Alias /api/settings to /api/system for backward compatibility with frontend
app.use('/api/settings', (req, res, next) => {
    if (req.method === 'GET') req.url = '/';
    if (req.method === 'PUT') req.url = '/settings';
    systemRouter(req, res, next);
});

// Alias moved lexicon and dividend-policy routes
app.use('/api/system/lexicon', (req, res, next) => { req.url = '/lexicon'; ictRouter(req, res, next); });
app.use('/api/system/dividend-policy', (req, res, next) => { req.url = '/dividend-policy'; ictRouter(req, res, next); });
app.use('/api/notifications', authRequired, require('./routes/notifications'));
app.use('/api/member/notifications', memberAuthRequired, maintenanceMiddleware, require('./routes/notifications'));
app.use('/api/ict', ictRouter);
app.use('/api/investments', require('./routes/investments'));
app.use('/api/comm', require('./routes/comm'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/documents', require('./routes/documents'));

// --- Digital ID Verify ---
app.get('/api/v/verify/:membershipNumber', async (req, res) => {
    try {
        const { dbGet } = require('./utils/helpers');
        const member = await dbGet('SELECT name, membershipNumber, status, joinDate FROM members WHERE membershipNumber = ? COLLATE NOCASE', [req.params.membershipNumber]);
        if (!member) return res.status(404).json({ error: 'Identity pass not found or invalid.' });
        res.json({ member });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- /api/tiers shortcut (frontend calls this directly) ---
app.get('/api/tiers', authRequired, async (req, res) => {
    try {
        const { dbAll } = require('./utils/helpers');
        const tiers = await dbAll('SELECT * FROM contribution_tiers ORDER BY monthlyTarget ASC');
        res.json({ tiers });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fallback 404 for /api
app.use('/api', (req, res) => {
    console.warn(`[404] API route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

// --- Serve Frontend ---
const distPath = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA catch-all
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile('index.html', { root: distPath });
    });
}

// --- Error Handler ---
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.stack);
    if (!res.headersSent) {
        res.status(err.status || 500).json({ error: 'Internal Server Error', message: err.message });
    }
});

// --- Start ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 LLUCG CMS Backend v3.0 (Modular)`);
    console.log(`📡 Endpoint: http://localhost:${PORT}`);
    console.log(`📅 Started: ${new Date().toLocaleString()}\n`);
    initCrons();
});
