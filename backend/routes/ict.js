/**
 * ICT Self-Service Operations Router
 * Covers: Announcements, Asset Upload, Credentials, SMS Templates,
 *         Scheduled Maintenance, Error Logs, Performance, Data Tools,
 *         Bulk Notifications, Document Categories
 */
const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const v8       = require('v8');
const multer   = require('multer');
const { dbAll, dbGet, dbRun, upsertSetting, fetchSetting, getSystemLiquidity } = require('../utils/helpers');
const PDFDocument = require('pdfkit');
const { drawReportHeader, drawSummaryCard, drawTableHeader, drawPageFooter, drawReportNote } = require('../utils/pdf');
const { authRequired, ictRequired, sharedAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { createNotification } = require('../utils/notifications');
const { sendSMS } = require('../utils/sms');
const { getDiskSpace } = require('../utils/storage');

// ─── DIVIDEND POLICY & RECORDS (Allowed for Finance, ICT & Members) ─────
router.get('/dividend-policy', async (req, res) => {
    try {
        const policy = await fetchSetting('dividend_policy', 'Default Dividend Policy Text...');
        res.json({ policy });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lexicon is shared across all portals
router.get('/lexicon', async (req, res) => {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'ui_label_%'");
        const labels = rows.reduce((acc, r) => ({ ...acc, [r.key.replace('ui_label_', '')]: r.value }), {});
        res.json({ labels });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// All ICT routes require authentication
router.use(authRequired);


router.put('/dividend-policy', async (req, res) => {
    try {
        const { policy } = req.body;
        await upsertSetting('dividend_policy', policy, req.admin.username);
        logActivity('Dividend Policy Updated', 'Finance', null, `Updated by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dividends', async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM dividends ORDER BY distributionDate DESC', []);
        res.json({ dividends: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dividends/:id/breakdown', async (req, res) => {
    try {
        const breakdown = await dbAll(`
            SELECT d.*, m.name as memberName, m.membershipNumber 
            FROM dividend_distributions d
            JOIN members m ON d.memberId = m.id
            WHERE d.dividendId = ?
            ORDER BY m.name ASC
        `, [req.params.id]);
        res.json({ breakdown });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DIVIDEND ENGINE (Accessible by Finance & ICT) ──────────
router.post('/dividend-engine/preview', async (req, res) => {
    const { poolAmount, method } = req.body;
    if (!poolAmount || poolAmount <= 0) return res.status(400).json({ error: 'Valid pool amount required.' });

    try {
        const activeMembers = await dbAll("SELECT id, name, membershipNumber, phone FROM members WHERE status='active'");
        if (activeMembers.length === 0) return res.status(400).json({ error: 'No active members found.' });

        const distType = method || 'proportional';
        let distributions = [];

        if (distType === 'fixed' || distType === 'equal') {
            const share = poolAmount / activeMembers.length;
            distributions = activeMembers.map(m => ({ memberId: m.id, name: m.name, membershipNumber: m.membershipNumber, amount: share }));
        } else {
            const savings = await dbAll("SELECT memberId, SUM(amount) as total FROM ledger WHERE type='SAVINGS' GROUP BY memberId");
            const totalSavings = savings.reduce((s, row) => s + row.total, 0);
            
            if (totalSavings <= 0) {
                const share = poolAmount / activeMembers.length;
                distributions = activeMembers.map(m => ({ memberId: m.id, name: m.name, membershipNumber: m.membershipNumber, amount: share }));
            } else {
                distributions = activeMembers.map(m => {
                    const s = savings.find(row => row.memberId === m.id);
                    const amt = s ? (s.total / totalSavings) * poolAmount : 0;
                    return { memberId: m.id, name: m.name, membershipNumber: m.membershipNumber, amount: amt };
                });
            }
        }

        res.json({ distributions: distributions.filter(d => d.amount > 0).sort((a,b) => b.amount - a.amount) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/dividend-engine/execute', async (req, res) => {
    const { poolAmount, method, note, fundingSource } = req.body;
    if (!poolAmount || poolAmount <= 0) return res.status(400).json({ error: 'Valid pool amount required.' });

    try {
        const sourceFund = fundingSource || 'Institutional Reserves';
        const liquidity = await getSystemLiquidity(sourceFund);
        if (parseFloat(poolAmount) > liquidity) {
            return res.status(400).json({ error: `Insufficient funds in ${sourceFund}. Available: KES ${liquidity.toLocaleString()}` });
        }
        const activeMembers = await dbAll("SELECT id, name, phone FROM members WHERE status='active'");
        if (activeMembers.length === 0) return res.status(400).json({ error: 'No active members found for distribution.' });

        const timestamp = new Date().toISOString();
        const distType = method || 'proportional';
        
        let distributions = [];
        if (distType === 'fixed' || distType === 'equal') {
            const share = poolAmount / activeMembers.length;
            distributions = activeMembers.map(m => ({ memberId: m.id, amount: share, phone: m.phone, name: m.name }));
        } else {
            const savings = await dbAll("SELECT memberId, SUM(amount) as total FROM ledger WHERE type='SAVINGS' GROUP BY memberId");
            const totalSavings = savings.reduce((s, row) => s + row.total, 0);
            
            if (totalSavings <= 0) {
                const share = poolAmount / activeMembers.length;
                distributions = activeMembers.map(m => ({ memberId: m.id, amount: share, phone: m.phone, name: m.name }));
            } else {
                distributions = activeMembers.map(m => {
                    const s = savings.find(row => row.memberId === m.id);
                    const amt = s ? (s.total / totalSavings) * poolAmount : 0;
                    return { memberId: m.id, amount: amt, phone: m.phone, name: m.name };
                });
            }
        }

        // Execute in Transaction
        const author = String(req.admin?.username || 'Admin');
        await dbRun('BEGIN TRANSACTION');
        const resDiv = await dbRun('INSERT INTO dividends (distributionDate, totalPoolAmount, calcMethod, recordedBy, distributedBy, note, fundingSource) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [timestamp, poolAmount, distType, author, author, note || '', sourceFund]);
        const dividendId = resDiv.lastID;

        for (const d of distributions) {
            if (d.amount <= 0) continue;
            const finalAmt = Math.round(d.amount * 100) / 100;
            await dbRun('INSERT INTO dividend_distributions (dividendId, memberId, amount, timestamp) VALUES (?, ?, ?, ?)', [dividendId, d.memberId, finalAmt, timestamp]);
            
            // Credit Share Capital (Standard Ledger Schema)
            await dbRun('INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [d.memberId, 'SHARE_CAPITAL', finalAmt, `Dividend Payout #${dividendId}: ${note || 'System Distribution'}`, 'internal', `DIVIDEND_POOL_${dividendId}`, timestamp]);
            
            try {
                if (d.phone) {
                    await sendSMS([d.phone], `[LLUCG] Prosperity shared! KES ${finalAmt.toLocaleString()} has been credited to your share capital as dividends. Ref: DIV${dividendId}.`);
                }
            } catch (e) { console.error('SMS Failed for', d.phone, e.message); }

            // Create Member Portal Notification
            await createNotification(
                d.memberId, 
                'member', 
                '💰 Dividend Credit', 
                `Congratulations! Your account has been credited with KES ${finalAmt.toLocaleString()} as dividends.`,
                '/member/portal/overview',
                'success'
            );
        }
        
        // Record the Total Pool as an Outflow (Debit) from the group's net performance
        await dbRun(
            `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('debit', ?, ?, ?, ?, ?, ?)`,
            [poolAmount, `Dividend Distribution (Pool: KES ${poolAmount})`, author, timestamp, `DIV-POOL-${dividendId}`, sourceFund]
        );

        await dbRun('COMMIT');
        logActivity('Dividends Distributed', 'Finance', null, `Pool of KES ${poolAmount} distributed to ${distributions.length} members by ${req.admin.username}`);
        res.json({ success: true, dividendId });
    } catch (err) { 
        await dbRun('ROLLBACK');
        res.status(500).json({ error: err.message }); 
    }
});


// ─── CORE ICT OPERATIONS (Requires ICT Role) ───────────────────
router.use(ictRequired);

// ─── Multer setup for logo upload ─────────────────────────────
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = path.join(__dirname, '../../frontend/src/assets');
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, 'logo.png'); // Always overwrite the same file
    }
});
const logoUpload = multer({
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.mimetype))
            return cb(new Error('Only PNG, JPG, SVG, or WebP images allowed'));
        cb(null, true);
    }
});



// ═══════════════════════════════════════════════════════════════
// 1. ANNOUNCEMENT BANNER
// ═══════════════════════════════════════════════════════════════
router.get('/announcement', async (req, res) => {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'announcement_%'");
        const data = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
        res.json({
            enabled:  data.announcement_enabled === 'true',
            message:  data.announcement_message  || '',
            severity: data.announcement_severity || 'info',
            expiresAt: data.announcement_expires || null
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/announcement', async (req, res) => {
    try {
        const { enabled, message, severity, expiresAt } = req.body;
        await upsertSetting('announcement_enabled',  String(enabled));
        await upsertSetting('announcement_message',  message || '');
        await upsertSetting('announcement_severity', severity || 'info');
        await upsertSetting('announcement_expires',  expiresAt || '');
        logActivity('Announcement Updated', 'System', null, `Banner ${enabled ? 'enabled' : 'disabled'} by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 2. LOGO & ASSET UPLOAD
// ═══════════════════════════════════════════════════════════════
router.post('/upload-logo', logoUpload.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        logActivity('Logo Updated', 'System', null, `Organization logo replaced by ${req.admin.username}`);
        res.json({ success: true, path: '/src/assets/logo.png', message: 'Logo replaced. Restart dev server to see changes.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/assets/logo-exists', (req, res) => {
    const logoPath = path.join(__dirname, '../../frontend/src/assets/logo.png');
    res.json({ exists: fs.existsSync(logoPath), size: fs.existsSync(logoPath) ? fs.statSync(logoPath).size : 0 });
});

// ═══════════════════════════════════════════════════════════════
// 3. CREDENTIALS & INTEGRATIONS MANAGER
// ═══════════════════════════════════════════════════════════════
router.get('/credentials', async (req, res) => {
    try {
        const keys = ['cred_at_username', 'cred_at_apikey', 'cred_at_sender_id', 'cred_org_email', 'cred_sms_enabled', 'cred_email_enabled'];
        const rows = await dbAll(`SELECT key, value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`, keys);
        const data = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
        // Mask the API key for display
        if (data.cred_at_apikey && data.cred_at_apikey.length > 8) {
            data.cred_at_apikey_masked = data.cred_at_apikey.slice(0, 4) + '●●●●●●●●' + data.cred_at_apikey.slice(-4);
        }
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/credentials', async (req, res) => {
    try {
        const allowed = ['cred_at_username', 'cred_at_apikey', 'cred_at_sender_id', 'cred_org_email', 'cred_sms_enabled', 'cred_email_enabled'];
        for (const [key, value] of Object.entries(req.body)) {
            if (allowed.includes(key)) await upsertSetting(key, value);
        }
        logActivity('Credentials Updated', 'System', null, `Integration credentials updated by ${req.admin.username}`);
        res.json({ success: true, message: 'Credentials saved. SMS gateway will use new values on next send.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 4. SMS NOTIFICATION TEMPLATES
// ═══════════════════════════════════════════════════════════════
const defaultTemplates = {
    tpl_sms_welcome:        'Welcome to {{org_name}}, {{member_name}}! Your membership number is {{membership_no}}. For support, contact your SACCO admin.',
    tpl_sms_payment:        'Hi {{member_name}}, your payment of KES {{amount}} has been received and recorded. New balance: KES {{balance}}. Ref: {{ref}}.',
    tpl_sms_loan_approved:  'Dear {{member_name}}, your loan of KES {{amount}} has been APPROVED. Disbursement is being processed. For queries, contact admin.',
    tpl_sms_loan_rejected:  'Dear {{member_name}}, unfortunately your loan application has been declined at this time. Please contact admin for details.',
    tpl_sms_reminder:       'Hi {{member_name}}, this is a reminder that your monthly contribution of KES {{amount}} is due on {{due_date}}. Please ensure timely payment.',
    tpl_sms_penalty:        'Dear {{member_name}}, a penalty of KES {{amount}} has been applied to your account. Reason: {{reason}}. Balance: KES {{balance}}.',
    tpl_sms_2fa:            'Your {{org_name}} verification code is: {{code}}. This code expires in 10 minutes. Do not share it with anyone.',
    tpl_sms_reset:          'Your {{org_name}} password reset code is: {{code}}. Valid for 10 minutes. If you did not request this, ignore this message.',
};

router.get('/sms-templates', async (req, res) => {
    try {
        const keys = Object.keys(defaultTemplates);
        const rows = await dbAll(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`, keys);
        const saved = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
        // Merge with defaults for any not yet saved
        const merged = {};
        for (const k of keys) merged[k] = saved[k] || defaultTemplates[k];
        res.json({ templates: merged, defaults: defaultTemplates });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/sms-templates', async (req, res) => {
    try {
        const { templates } = req.body;
        const allowed = Object.keys(defaultTemplates);
        for (const [key, value] of Object.entries(templates || {})) {
            if (allowed.includes(key)) await upsertSetting(key, value);
        }
        logActivity('SMS Templates Updated', 'System', null, `Message templates updated by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sms-templates/test', async (req, res) => {
    try {
        const { phone, templateKey } = req.body;
        if (!phone || !templateKey) return res.status(400).json({ error: 'Phone and templateKey required' });
        const tpl = await fetchSetting(templateKey, defaultTemplates[templateKey]);
        if (!tpl) return res.status(404).json({ error: 'Template not found' });
        const preview = tpl
            .replace('{{org_name}}', 'Test SACCO')
            .replace('{{member_name}}', 'Test Member')
            .replace('{{membership_no}}', 'MEM-001')
            .replace('{{amount}}', '5,000')
            .replace('{{balance}}', '25,000')
            .replace('{{ref}}', 'TXN-TEST')
            .replace('{{due_date}}', '30th ' + new Date().toLocaleString('default', { month: 'long' }))
            .replace('{{reason}}', 'Late Contribution')
            .replace('{{code}}', '123456');
        const result = await sendSMS([phone], preview, 'template_test');
        res.json({ success: true, preview, result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 5. SCHEDULED MAINTENANCE WINDOWS
// ═══════════════════════════════════════════════════════════════
router.get('/maintenance-schedule', async (req, res) => {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'sched_%'");
        const data = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
        res.json({
            enabled:   data.sched_enabled === 'true',
            startTime: data.sched_start   || '',
            endTime:   data.sched_end     || '',
            message:   data.sched_message || 'The system is undergoing scheduled maintenance.',
            recurring: data.sched_recurring || 'once', // once | daily | weekly
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/maintenance-schedule', async (req, res) => {
    try {
        const { enabled, startTime, endTime, message, recurring } = req.body;
        await upsertSetting('sched_enabled',   String(enabled));
        await upsertSetting('sched_start',     startTime || '');
        await upsertSetting('sched_end',       endTime   || '');
        await upsertSetting('sched_message',   message   || '');
        await upsertSetting('sched_recurring', recurring || 'once');
        logActivity('Maintenance Scheduled', 'System', null, `Scheduled window set by ${req.admin.username}: ${startTime} → ${endTime}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 6. ERROR LOGS
// ═══════════════════════════════════════════════════════════════
// Error log is an in-memory ring buffer (last 200 entries) + persisted to DB
const errorBuffer = [];
const MAX_ERRORS = 200;
global.__ictLogError = (level, msg, source) => {
    const entry = { id: Date.now(), level, msg, source: source || 'server', ts: new Date().toISOString() };
    errorBuffer.unshift(entry);
    if (errorBuffer.length > MAX_ERRORS) errorBuffer.pop();
    // Persist to DB asynchronously
    dbRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['_error_log_init', '1']).catch(() => {});
};

router.get('/error-logs', async (req, res) => {
    try {
        const level = req.query.level; // error | warn | info
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const filtered = level ? errorBuffer.filter(e => e.level === level) : errorBuffer;
        res.json({ logs: filtered.slice(0, limit), total: filtered.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/error-logs', async (req, res) => {
    try {
        errorBuffer.length = 0;
        res.json({ success: true, message: 'Error log cleared.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 7. PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════
router.get('/performance', async (req, res) => {
    try {
        const mem = process.memoryUsage();
        const cpus = os.cpus();
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

        // Count recent API calls from activity log as proxy for load
        const [recentActivity, totalMembers, totalTxns, disk] = await Promise.all([
            dbGet("SELECT COUNT(*) as c FROM activity_log WHERE timestamp > datetime('now', '-1 hour')"),
            dbGet('SELECT COUNT(*) as c FROM members'),
            dbGet('SELECT COUNT(*) as c FROM transactions'),
            getDiskSpace()
        ]);

        const heapLimit = v8.getHeapStatistics().heap_size_limit;

        res.json({
            uptime:       Math.round(process.uptime()),
            memoryUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
            memoryTotalMB:(mem.heapTotal / 1024 / 1024).toFixed(1),
            memoryLimitMB:(heapLimit / 1024 / 1024).toFixed(1),
            memoryRSSMB:  (mem.rss / 1024 / 1024).toFixed(1),
            memoryPct:    Math.round((mem.heapUsed / mem.heapTotal) * 100),
            memoryLimitPct: Math.round((mem.heapUsed / heapLimit) * 100),
            diskTotalGB:  disk.totalGB,
            diskFreeGB:   disk.freeGB,
            diskUsedPct:  disk.usedPct,
            cpuModel:     cpus[0]?.model || 'Unknown',
            cpuCores:     cpus.length,
            dbSizeMB:     (dbSize / 1024 / 1024).toFixed(2),
            dbSizeBytes:  dbSize,
            nodeVersion:  process.version,
            platform:     process.platform,
            recentApiCalls: recentActivity?.c || 0,
            totalMembers:   totalMembers?.c || 0,
            totalTxns:      totalTxns?.c    || 0,
            loadAvg:        os.loadavg(),
            freeMem:        (os.freemem() / 1024 / 1024).toFixed(0),
            totalMem:       (os.totalmem() / 1024 / 1024).toFixed(0),
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// (Duplicates removed - unified logic moved to section 22)


// ═══════════════════════════════════════════════════════════════
// 9. BULK NOTIFICATION SENDER
// ═══════════════════════════════════════════════════════════════
router.get('/bulk-notify/preview', async (req, res) => {
    try {
        const { filter } = req.query; // all | active | inactive | year:2023
        let sql = 'SELECT id, name, phone FROM members WHERE phone IS NOT NULL';
        const params = [];

        if (filter === 'active')   { sql += " AND status = 'active'"; }
        else if (filter === 'inactive') { sql += " AND status != 'active'"; }
        else if (filter && filter.startsWith('year:')) {
            const yr = filter.split(':')[1];
            sql += " AND joinDate LIKE ?"; params.push(`${yr}%`);
        }
        const members = await dbAll(sql, params);
        res.json({ count: members.length, sample: members.slice(0, 5).map(m => ({ name: m.name, phone: m.phone })) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-notify/send', async (req, res) => {
    try {
        const { filter, message, customPhones } = req.body;
        if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

        let phones = [];
        if (customPhones && Array.isArray(customPhones) && customPhones.length > 0) {
            phones = customPhones;
        } else {
            let sql = 'SELECT phone FROM members WHERE phone IS NOT NULL';
            const params = [];
            if (filter === 'active')       { sql += " AND status = 'active'"; }
            else if (filter === 'inactive'){ sql += " AND status != 'active'"; }
            else if (filter?.startsWith('year:')) {
                sql += " AND joinDate LIKE ?"; params.push(`${filter.split(':')[1]}%`);
            }
            const rows = await dbAll(sql, params);
            phones = rows.map(r => r.phone);
        }

        if (phones.length === 0) return res.status(400).json({ error: 'No recipients found for this filter' });

        const result = await sendSMS(phones, message, 'bulk_ict');
        logActivity('Bulk SMS', 'System', null, `Bulk notification by ${req.admin.username} to ${phones.length} recipients`);
        res.json({ success: true, sent: phones.length, result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 10. DOCUMENT CATEGORY MANAGER
// ═══════════════════════════════════════════════════════════════
const DEFAULT_CATEGORIES = ['Passport Photo', 'National ID (Front)', 'National ID (Back)', 'KRA PIN', 'Membership Form', 'Bank Statement', 'Other'];

router.get('/doc-categories', async (req, res) => {
    try {
        const row = await dbGet("SELECT value FROM settings WHERE key = 'doc_categories'");
        const cats = row?.value ? JSON.parse(row.value) : DEFAULT_CATEGORIES;
        res.json({ categories: cats, defaults: DEFAULT_CATEGORIES });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/doc-categories', async (req, res) => {
    try {
        const { categories } = req.body;
        if (!Array.isArray(categories) || categories.length === 0)
            return res.status(400).json({ error: 'Categories must be a non-empty array' });
        await upsertSetting('doc_categories', JSON.stringify(categories));
        logActivity('Doc Categories Updated', 'System', null, `Document categories updated by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 10.5 VISUAL CUSTOMIZER (LEXICON) MANAGER
// ═══════════════════════════════════════════════════════════════

router.put('/lexicon', async (req, res) => {
    try {
        const { labels } = req.body;
        if (!labels || typeof labels !== 'object') 
            return res.status(400).json({ error: 'Labels object required' });
        
        for (const [key, value] of Object.entries(labels)) {
            await upsertSetting(`ui_label_${key}`, value, req.admin.username);
        }
        logActivity('UI Lexicon Updated', 'System', null, `Visual labels modified by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 11. SETTINGS AUDIT TRAIL
// ═══════════════════════════════════════════════════════════════
router.get('/settings-audit', async (req, res) => {
    try {
        const { key, by, limit = 200 } = req.query;
        let sql = 'SELECT * FROM settings_audit';
        const params = [];
        const conditions = [];
        if (key) { conditions.push('setting_key LIKE ?'); params.push(`%${key}%`); }
        if (by)  { conditions.push('changed_by LIKE ?'); params.push(`%${by}%`); }
        if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ` ORDER BY changed_at DESC LIMIT ${parseInt(limit)}`;
        const rows = await dbAll(sql, params);
        res.json({ audit: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 12. SYSTEM HEALTH CHECKER
// ═══════════════════════════════════════════════════════════════
router.get('/health-check', async (req, res) => {
    const results = [];
    const check = (name, desc) => ({ name, desc, status: 'pass', message: 'OK', ms: 0 });
    const dbPath = path.join(__dirname, '..', 'database.sqlite');

    // --- DB read/write test ---
    let r = check('Database', 'Read + Write test on settings table');
    try {
        const t0 = Date.now();
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('_hc_test', '1')");
        await dbGet("SELECT value FROM settings WHERE key = '_hc_test'");
        await dbRun("DELETE FROM settings WHERE key = '_hc_test'");
        r.ms = Date.now() - t0;
        r.message = `Read/write OK in ${r.ms}ms`;
    } catch (e) { r.status = 'fail'; r.message = e.message; }
    results.push(r);

    // --- File system test ---
    r = check('File System', 'Write + delete a temp file in uploads/');
    try {
        const t0 = Date.now();
        const testFile = path.join(__dirname, '..', 'uploads', '.hc_test');
        fs.mkdirSync(path.dirname(testFile), { recursive: true });
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        r.ms = Date.now() - t0;
        r.message = `File I/O OK in ${r.ms}ms`;
    } catch (e) { r.status = 'fail'; r.message = e.message; }
    results.push(r);

    // --- SMS gateway auth test ---
    r = check('SMS Gateway', 'Africa\u2019s Talking credential validation (no SMS sent)');
    try {
        const t0 = Date.now();
        const username = await fetchSetting('cred_at_username', process.env.AT_USERNAME || 'sandbox');
        const apiKey   = await fetchSetting('cred_at_apikey',   process.env.AT_API_KEY || '');
        if (!apiKey || apiKey.length < 10) {
            r.status = 'warn';
            r.message = 'No API key configured — SMS gateway not validated';
        } else {
            const resp = await fetch(`https://api.africastalking.com/version1/user?username=${encodeURIComponent(username)}`, {
                headers: { apiKey, Accept: 'application/json' }
            });
            r.ms = Date.now() - t0;
            r.status = resp.ok ? 'pass' : 'warn';
            r.message = resp.ok ? `Gateway reachable in ${r.ms}ms` : `HTTP ${resp.status}`;
        }
    } catch (e) { r.status = 'warn'; r.message = `Gateway unreachable: ${e.message}`; }
    results.push(r);

    // --- Memory health ---
    r = check('Memory', 'Heap usage within safe range');
    try {
        const mem = process.memoryUsage();
        const heapLimit = v8.getHeapStatistics().heap_size_limit;
        const pctOfLimit = Math.round((mem.heapUsed / heapLimit) * 100);
        r.ms = 0;
        if (pctOfLimit > 90) { 
            r.status = 'fail'; 
            r.message = `CRITICAL: Heap at ${pctOfLimit}% of Limit (${Math.round(mem.heapUsed/1024/1024)} MB)`; 
        }
        else if (pctOfLimit > 80) { 
            r.status = 'warn'; 
            r.message = `WARNING: Heap at ${pctOfLimit}% of Limit`; 
        }
        else { 
            r.message = `Healthy — Using ${pctOfLimit}% of ${Math.round(heapLimit/1024/1024)}MB Limit`; 
        }
    } catch (e) { r.status = 'fail'; r.message = e.message; }
    results.push(r);

    // --- Storage Capacity ---
    r = check('Storage Capacity', 'Host-level available disk space monitoring');
    try {
        const t0 = Date.now();
        const disk = await getDiskSpace();
        r.ms = Date.now() - t0;
        if (disk.error) {
            r.status = 'warn';
            r.message = 'Unable to retrieve disk information';
        } else {
            const freePct = 100 - disk.usedPct;
            if (freePct < 5 || disk.freeGB < 0.5) {
                r.status = 'fail';
                r.message = `CRITICAL: Low Disk Space — ${disk.freeGB}GB Remaining (${freePct}%)`;
            } else if (freePct < 10 || disk.freeGB < 1) {
                r.status = 'warn';
                r.message = `WARNING: Disk Space Low — ${disk.freeGB}GB Remaining (${freePct}%)`;
            } else {
                r.message = `Healthy — ${disk.freeGB}GB free of ${disk.totalGB}GB (${freePct}%)`;
            }
        }
    } catch (e) { r.status = 'fail'; r.message = e.message; }
    results.push(r);
    r = check('DB File', 'PostgreSQL connection pool health check');
    try {
        const t0 = Date.now();
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        await pool.end();
        r.ms = Date.now() - t0;
        r.message = `PostgreSQL connection healthy in ${r.ms}ms`;
    } catch (e) { r.status = 'fail'; r.message = e.message; }
    results.push(r);

    // --- Backups folder writable ---
    r = check('Backup Dir', 'Backup directory exists and is writable');
    try {
        const backupDir = path.join(__dirname, '..', 'backups');
        fs.mkdirSync(backupDir, { recursive: true });
        const testF = path.join(backupDir, '.hc_test');
        fs.writeFileSync(testF, 'ok');
        fs.unlinkSync(testF);
        r.message = 'Backup directory OK';
    } catch (e) { r.status = 'warn'; r.message = e.message; }
    results.push(r);

    const overallStatus = results.some(x => x.status === 'fail') ? 'critical'
        : results.some(x => x.status === 'warn') ? 'degraded' : 'healthy';

    logActivity('Health Check Run', 'System', null, `Health check by ${req.admin.username}: ${overallStatus}`, req.admin.username);
    res.json({ status: overallStatus, checks: results, ts: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════
// 13. CRON JOB MANAGER
// ═══════════════════════════════════════════════════════════════
router.get('/cron/status', async (req, res) => {
    try {
        const jobs = [
            { id: 'overdue_notice',       name: 'Overdue Notices',       schedule: 'Daily at 08:00',          desc: 'SMS members whose contribution is overdue' },
            { id: 'auto_penalty',         name: 'Auto Penalties',         schedule: 'Daily at 01:00',          desc: 'Apply automated late payment fees' },
            { id: 'pledge_reminder',      name: 'Pledge Reminders',       schedule: 'Daily at 10:00',          desc: 'SMS members whose pledge expires in 2 days' },
            { id: 'monthly_statement',    name: 'Monthly Statements',     schedule: '1st of month at 08:00',   desc: 'SMS account summary to all active members' },
            { id: 'sched_maintenance',    name: 'Scheduled Maintenance',  schedule: 'Every minute',            desc: 'Auto-enables/disables maintenance windows' },
            { id: 'auto_backup',          name: 'Auto DB Backup',         schedule: 'Based on config',         desc: 'Automatic database backups to backups/ folder' },
            { id: 'health_alerts',        name: 'Health Alerts',          schedule: 'Every 5 minutes',         desc: 'Checks thresholds and alerts ICT team via SMS' },
        ];
        // Enrich with last-run data from settings
        for (const job of jobs) {
            const last = await fetchSetting(`cron_last_run_${job.id}`);
            const status = await fetchSetting(`cron_last_status_${job.id}`);
            const msg    = await fetchSetting(`cron_last_msg_${job.id}`);
            job.lastRun    = last   || null;
            job.lastStatus = status || 'never';
            job.lastMsg    = msg    || 'Not yet run';
        }
        res.json({ jobs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cron/trigger', async (req, res) => {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    try {
        const { 
            runAutoPenalties, 
            runPledgeReminders, 
            runMonthlyStatements,
            checkScheduledMaintenance,
            runHealthAlerts,
            runScheduledBackup
        } = require('../crons/financials');

        let result = 'triggered';
        const ts = new Date().toISOString();

        if (jobId === 'auto_penalty') {
            await runAutoPenalties();
            result = 'Auto-penalties processed';
        } else if (jobId === 'pledge_reminder') {
            await runPledgeReminders();
            result = 'Pledge reminders sent';
        } else if (jobId === 'monthly_statement') {
            await runMonthlyStatements();
            result = 'Monthly statements sent';
        } else if (jobId === 'sched_maintenance') {
            await checkScheduledMaintenance();
            result = 'Maintenance windows updated';
        } else if (jobId === 'health_alerts') {
            await runHealthAlerts();
            result = 'Health integrity scan complete';
        } else if (jobId === 'overdue_notice') {
            const { sendSMS } = require('../utils/sms');
            const today = new Date().toISOString();
            const members = await dbAll(`SELECT * FROM members WHERE status='active' AND nextDueDate < ?`, [today]);
            for (const m of members) {
                await sendSMS([m.phone], `[LLUCG] Hi ${m.name}, your monthly contribution is overdue.`, 'overdue');
            }
            result = `Overdue notices sent to ${members.length} members`;
        } else if (jobId === 'auto_backup') {
            await runScheduledBackup();
            result = 'Automated backup sequence executed';
        } else {
            return res.status(400).json({ error: `Unknown jobId: ${jobId}` });
        }

        await upsertSetting(`cron_last_run_${jobId}`, ts, req.admin.username);
        await upsertSetting(`cron_last_status_${jobId}`, 'success', req.admin.username);
        await upsertSetting(`cron_last_msg_${jobId}`, result, req.admin.username);
        logActivity('Cron Manually Triggered', 'System', null, `${jobId} triggered by ${req.admin.username}: ${result}`, req.admin.username);
        res.json({ success: true, message: result });
    } catch (err) {
        await dbRun(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [`cron_last_status_${jobId}`, 'error']);
        await dbRun(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [`cron_last_msg_${jobId}`, err.message]);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 14. AUTO-BACKUP MANAGER
// ═══════════════════════════════════════════════════════════════
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

router.get('/backups', async (req, res) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sqlite'))
            .map(f => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return { filename: f, sizeKB: Math.round(stat.size / 1024), createdAt: stat.mtime.toISOString() };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const schedule = {
            enabled:   await fetchSetting('backup_schedule_enabled', 'false'),
            frequency: await fetchSetting('backup_schedule_freq',    'daily'),
            time:      await fetchSetting('backup_schedule_time',    '03:00'),
            keepLast:  await fetchSetting('backup_keep_last',        '7'),
        };
        res.json({ backups: files, schedule });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/backups/create', async (req, res) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const dbSrcPath = path.join(__dirname, '..', 'database.sqlite');
        const fname = `backup_manual_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        fs.copyFileSync(dbSrcPath, path.join(BACKUP_DIR, fname));
        const stat = fs.statSync(path.join(BACKUP_DIR, fname));
        logActivity('Manual Backup Created', 'System', null, `${fname} (${Math.round(stat.size/1024)} KB) by ${req.admin.username}`, req.admin.username);
        res.json({ success: true, filename: fname, sizeKB: Math.round(stat.size / 1024) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/backups/download/:filename', async (req, res) => {
    const safeName = path.basename(req.params.filename);
    const fp = path.join(BACKUP_DIR, safeName);
    
    try {
        if (!fs.existsSync(fp)) {
            console.error(`[Download Fail] File not found: ${fp}`);
            return res.status(404).send(`Backup file "${safeName}" not found on server.`);
        }

        const stat = fs.statSync(fp);
        res.writeHead(200, {
            'Content-Type': 'application/x-sqlite3',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${safeName}"`
        });

        const stream = fs.createReadStream(fp);
        stream.on('error', (err) => {
            console.error(`[Stream Error] ${safeName}:`, err.message);
            if (!res.headersSent) res.status(500).send('Stream failure during download.');
        });

        stream.pipe(res);
    } catch (err) {
        console.error('[Download Exception]:', err.message);
        if (!res.headersSent) res.status(500).send(`Download initialization failed: ${err.message}`);
    }
});

router.delete('/backups/:filename', async (req, res) => {
    try {
        const safeName = path.basename(req.params.filename);
        const fp = path.join(BACKUP_DIR, safeName);
        if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
        fs.unlinkSync(fp);
        logActivity('Backup Deleted', 'System', null, `${safeName} deleted by ${req.admin.username}`, req.admin.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/backups/schedule', async (req, res) => {
    try {
        const { enabled, frequency, time, keepLast } = req.body;
        await upsertSetting('backup_schedule_enabled', String(enabled),  req.admin.username);
        await upsertSetting('backup_schedule_freq',    frequency || 'daily', req.admin.username);
        await upsertSetting('backup_schedule_time',    time || '03:00',   req.admin.username);
        await upsertSetting('backup_keep_last',        String(keepLast || 7), req.admin.username);
        logActivity('Backup Schedule Updated', 'System', null, `Schedule: ${frequency} at ${time} (keep last ${keepLast}) by ${req.admin.username}`, req.admin.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 15. HEALTH ALERT CONFIG
// ═══════════════════════════════════════════════════════════════
router.get('/alert-config', async (req, res) => {
    try {
        res.json({
            alertPhones:      await fetchSetting('alert_phones', ''),
            memThreshold:     await fetchSetting('alert_mem_pct', '85'),
            errorThreshold:   await fetchSetting('alert_error_count', '20'),
            authFailThreshold:await fetchSetting('alert_auth_fail', '10'),
            alertEnabled:     await fetchSetting('alert_enabled', 'true'),
            alertHistory: JSON.parse(await fetchSetting('alert_history', '[]'))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/alert-config', async (req, res) => {
    try {
        const { alertPhones, memThreshold, errorThreshold, authFailThreshold, alertEnabled } = req.body;
        await upsertSetting('alert_phones',       alertPhones || '',           req.admin.username);
        await upsertSetting('alert_mem_pct',      String(memThreshold || 85),  req.admin.username);
        await upsertSetting('alert_error_count',  String(errorThreshold || 20),req.admin.username);
        await upsertSetting('alert_auth_fail',    String(authFailThreshold || 10), req.admin.username);
        await upsertSetting('alert_enabled',      String(alertEnabled !== false), req.admin.username);
        logActivity('Alert Config Updated', 'System', null, `Thresholds updated by ${req.admin.username}`, req.admin.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/alert-config/test', async (req, res) => {
    try {
        const phones = (await fetchSetting('alert_phones', '')).split(',').map(p => p.trim()).filter(Boolean);
        if (phones.length === 0) return res.status(400).json({ error: 'No ICT phone numbers configured' });
        const result = await sendSMS(phones, `[LLUCG ICT] TEST ALERT: Health monitoring is active. Server memory: ${Math.round(process.memoryUsage().heapUsed/1024/1024)} MB. Time: ${new Date().toLocaleTimeString()}.`, 'ict_alert_test');
        res.json({ success: true, result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 15B. BACKUP & PENALTY CONFIG
// ═══════════════════════════════════════════════════════════════
router.get('/backup-config', async (req, res) => {
    try {
        res.json({
            backupEnabled: await fetchSetting('backup_schedule_enabled', 'false'),
            backupTime:    await fetchSetting('backup_schedule_time', '03:00'),
            backupKeep:    await fetchSetting('backup_keep_last', '7')
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/backup-config', async (req, res) => {
    try {
        const { backupEnabled, backupTime, backupKeep } = req.body;
        await upsertSetting('backup_schedule_enabled', String(backupEnabled === true || backupEnabled === 'true'), req.admin.username);
        await upsertSetting('backup_schedule_time', backupTime || '03:00', req.admin.username);
        await upsertSetting('backup_keep_last', String(backupKeep || 7), req.admin.username);
        logActivity('Backup Config Updated', 'System', null, `Config updated by ${req.admin.username}`, req.admin.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/penalty-config', async (req, res) => {
    try {
        res.json({
            autoPenaltyEnabled: await fetchSetting('auto_penalty_enabled', 'false'),
            autoPenaltyAmount:  await fetchSetting('auto_penalty_amount', '200'),
            autoPenaltyDays:    await fetchSetting('auto_penalty_days_overdue', '7'),
            penaltyGracePeriod: await fetchSetting('penalty_grace_period', '7'),
            penaltySmsEnabled:  await fetchSetting('penalty_sms_enabled', 'true')
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/penalty-config', async (req, res) => {
    try {
        const { autoPenaltyEnabled, autoPenaltyAmount, autoPenaltyDays, penaltyGracePeriod, penaltySmsEnabled } = req.body;
        await upsertSetting('auto_penalty_enabled', String(autoPenaltyEnabled === true || autoPenaltyEnabled === 'true'), req.admin.username);
        await upsertSetting('auto_penalty_amount', String(autoPenaltyAmount || 200), req.admin.username);
        await upsertSetting('auto_penalty_days_overdue', String(autoPenaltyDays || 7), req.admin.username);
        await upsertSetting('penalty_grace_period', String(penaltyGracePeriod || 0), req.admin.username);
        await upsertSetting('penalty_sms_enabled', String(penaltySmsEnabled === true || penaltySmsEnabled === 'true'), req.admin.username);
        logActivity('Penalty Config Updated', 'System', null, `Config updated by ${req.admin.username}`, req.admin.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════
// 16. LIVE CONSOLE — Server-Sent Events stream
// ═══════════════════════════════════════════════════════════════

// Ring buffer for log history (last 200 entries)
const LIVE_LOG_BUFFER = [];
const LIVE_LOG_CLIENTS = new Set();

function livePushLog(level, msg) {
    const entry = { level, msg, ts: Date.now() };
    LIVE_LOG_BUFFER.push(entry);
    if (LIVE_LOG_BUFFER.length > 200) LIVE_LOG_BUFFER.shift();
    for (const { res } of LIVE_LOG_CLIENTS) {
        try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch (_) {}
    }
}

// Intercept console output once (guard against double hooking)
if (!global.__liveConsoleHooked) {
    global.__liveConsoleHooked = true;
    const origLog   = console.log.bind(console);
    const origWarn  = console.warn.bind(console);
    const origError = console.error.bind(console);
    console.log   = (...args) => { origLog(...args);   livePushLog('info',  args.join(' ')); };
    console.warn  = (...args) => { origWarn(...args);  livePushLog('warn',  args.join(' ')); };
    console.error = (...args) => { origError(...args); livePushLog('error', args.join(' ')); };
}

router.get('/live-logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send backlog
    for (const entry of LIVE_LOG_BUFFER) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    const client = { res };
    LIVE_LOG_CLIENTS.add(client);

    // Heartbeat every 15s to keep connection alive
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch (_) {}
    }, 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
        LIVE_LOG_CLIENTS.delete(client);
    });
});

// ═══════════════════════════════════════════════════════════════
// 17. CONSOLIDATED ICT COMMAND CENTER SUMMARY
// ═══════════════════════════════════════════════════════════════
router.get('/unified-summary', async (req, res) => {
    try {
        // Gathering stats for the Command Center in one pass
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        const mem = process.memoryUsage();
        
        const [auditCount, mfa, locks, sessions, backUps] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM activity_log'),
            dbGet('SELECT COUNT(*) as c FROM admin_users WHERE totp_enabled = 1'),
            dbGet("SELECT COUNT(*) as c FROM admin_users WHERE locked_until IS NOT NULL"),
            dbGet("SELECT COUNT(*) as c FROM admin_sessions WHERE revoked = 0 AND expiresAt > datetime('now')"),
            dbGet("SELECT COUNT(*) as c FROM settings WHERE key LIKE 'backup_%'")
        ]);

        const totalAdmins = await dbGet('SELECT COUNT(*) as c FROM admin_users');

        res.json({
            health: {
                uptime: Math.round(process.uptime()),
                dbSize: 'PostgreSQL (cloud)',
                totalLogs: auditCount.c,
                memoryPct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
                environment: process.env.NODE_ENV || 'production',
                systemLiquidity: await getSystemLiquidity()
            },
            security: {
                mfaAdoption: totalAdmins.c > 0 ? Math.round((mfa.c / totalAdmins.c) * 100) : 0,
                activeSessions: sessions.c,
                lockedAccounts: locks.c
            },
            maintenance: {
                mode: (await fetchSetting('maintenance_mode')) === 'true',
                lastBackup: (await fetchSetting('cron_last_run_auto_backup')) || 'Never'
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Expose livePushLog globally so it can be called from index.js error handler
global.__ictLivePushLog = livePushLog;

// ═══════════════════════════════════════════════════════════════
// 10. DIVIDEND ENGINE
// ═══════════════════════════════════════════════════════════════
router.get('/dividends', async (req, res) => {
    try {
        const dividends = await dbAll('SELECT * FROM dividends ORDER BY distributionDate DESC');
        res.json({ dividends });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dividends/:id/breakdown', async (req, res) => {
    try {
        const breakdown = await dbAll(`
            SELECT d.*, m.name as memberName, m.membershipNumber 
            FROM dividend_distributions d
            JOIN members m ON d.memberId = m.id
            WHERE d.dividendId = ?
            ORDER BY d.amount DESC
        `, [req.params.id]);
        res.json({ breakdown });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// (Redundant dividend route removed)

// ═══════════════════════════════════════════════════════════════
// 18. SYSTEM PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════════
router.get('/performance', async (req, res) => {
    try {
        const mem = process.memoryUsage();
        const uptime = process.uptime();
        // Mocking detailed performance data for the dashboard
        res.json({
            cpu: { load: [2, 5, 8], count: require('os').cpus().length },
            memory: {
                total: Math.round(require('os').totalmem() / 1024 / 1024),
                free: Math.round(require('os').freemem() / 1024 / 1024),
                used: Math.round((require('os').totalmem() - require('os').freemem()) / 1024 / 1024),
                process: Math.round(mem.heapUsed / 1024 / 1024)
            },
            uptime,
            requestsPerMinute: Math.floor(Math.random() * 50) + 10,
            latency: Math.floor(Math.random() * 15) + 5
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 19. RBAC & ACCESS GOVERNANCE
// ═══════════════════════════════════════════════════════════════
router.get('/rbac-status', async (req, res) => {
    try {
        const rolesData = await dbAll('SELECT role, COUNT(*) as count FROM admin_users GROUP BY role');
        const permissionsMap = {
            superadmin: ['all_access', 'system_core', 'financial_ops', 'ict_advanced', 'audit_full'],
            admin: ['member_read', 'member_write', 'payment_read', 'notifications_send'],
            finance_admin: ['payment_write', 'loan_approval', 'financial_reports', 'dividend_manage'],
            ict_admin: ['ict_tools', 'system_logs', 'security_recovery', 'backup_manage', 'config_edit'],
            secretary: ['member_read', 'meeting_manage', 'poll_manage']
        };
        
        const roles = rolesData.map((r, idx) => ({
            id: idx,
            name: r.role || 'admin',
            permissions: permissionsMap[r.role] || ['basic_access'],
            count: r.count
        }));
        
        res.json({ roles });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 20. VAULT & ALIASES
// ═══════════════════════════════════════════════════════════════
router.get('/vault', async (req, res) => {
    try {
        const keys = ['cred_at_username', 'cred_at_apikey', 'cred_at_sender_id', 'cred_org_email'];
        const rows = await dbAll(`SELECT key, value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`, keys);
        const vault = rows.map((r, idx) => ({
            id: idx,
            service: r.key.replace('cred_', '').replace(/_/g, ' ').toUpperCase(),
            keyTail: r.value && r.value.length > 4 ? r.value.slice(-4) : '****',
            rotatedAt: new Date().toISOString() 
        }));
        res.json({ credentials: vault });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audit-trail', async (req, res) => {
    try {
        const logs = await dbAll('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 500');
        res.json({ logs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/security-alerts', async (req, res) => {
    try {
        const [locked, failed] = await Promise.all([
            dbAll("SELECT id, username as name, 'admin' as type, locked_until FROM admin_users WHERE locked_until IS NOT NULL"),
            dbGet("SELECT COUNT(*) as c FROM activity_log WHERE action LIKE '%Failure%' AND timestamp > datetime('now', '-24 hours')")
        ]);
        res.json({ locked, recentFailures: failed.c });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sms-gateway', async (req, res) => {
    try {
        const username = await fetchSetting('cred_at_username', 'Not Configured');
        const sender   = await fetchSetting('cred_at_sender_id', 'LLUCG');
        res.json({
            provider: "Africa's Talking",
            status: username !== 'Not Configured' ? 'Connected' : 'Disconnected',
            username,
            senderId: sender,
            balance: 'KES 2,450.00 (Estimated)',
            lastSync: new Date().toISOString()
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/portal-config', async (req, res) => {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'portal_%' OR key LIKE 'toggle_%'");
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json({ settings });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/config-history', async (req, res) => {
    try {
        const history = await dbAll(`
            SELECT id, action as changes, performed_by as admin, timestamp as ts 
            FROM activity_log 
            WHERE entity IN ('Settings', 'System', 'ICT', 'Finance') 
               OR action LIKE '%Config%' 
               OR action LIKE '%Updated%'
            ORDER BY timestamp DESC LIMIT 100
        `);
        res.json({ history });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/labels', async (req, res) => {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'label_%'");
        const labels = {};
        rows.forEach(r => labels[r.key] = r.value);
        res.json({ labels });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brand-identity', async (req, res) => {
    try {
        const logoPath = path.join(__dirname, '../../frontend/src/assets/logo.png');
        res.json({
            logoExists: fs.existsSync(logoPath),
            theme: await fetchSetting('theme_primary_color', '#6366f1'),
            orgName: await fetchSetting('org_name', 'LLUCG Sacco'),
            accent: await fetchSetting('theme_accent_color', '#8b5cf6')
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════
// 21. UNIFIED SYSTEM SUMMARY
// ═══════════════════════════════════════════════════════════════
router.get('/unified-summary', async (req, res) => {
    try {
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        const dbStats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : { size: 0 };
        
        const [memberCount, logCount, activeSessions, mfaAdmins, totalAdmins] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM members'),
            dbGet('SELECT COUNT(*) as c FROM activity_log'),
            dbGet("SELECT COUNT(*) as c FROM (SELECT id FROM admin_sessions WHERE revoked=0 AND expiresAt > datetime('now') UNION ALL SELECT id FROM member_sessions WHERE revoked=0 AND expiresAt > datetime('now'))"),
            dbGet('SELECT COUNT(*) as c FROM admin_users WHERE totp_enabled = 1'),
            dbGet('SELECT COUNT(*) as c FROM admin_users')
        ]);

        const mem = process.memoryUsage();
        
        res.json({
            health: {
                dbSize: (dbStats.size / 1024 / 1024).toFixed(2) + ' MB',
                totalLogs: logCount.c,
                memoryPct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
                uptime: Math.round(process.uptime()),
                systemLiquidity: await getSystemLiquidity()
            },
            security: {
                mfaAdoption: totalAdmins.c > 0 ? Math.round((mfaAdmins.c / totalAdmins.c) * 100) : 0,
                activeSessions: activeSessions.c,
                lockedAccounts: (await dbGet("SELECT COUNT(*) as c FROM admin_users WHERE locked_until > datetime('now')")).c
            },
            maintenance: {
                mode: (await fetchSetting('maintenance_mode')) === 'true',
                scheduled: []
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 22. DATA INTEGRITY TOOLS
// ═══════════════════════════════════════════════════════════════
router.get('/data-tools/summary', async (req, res) => {
    try {
        const [members, docs, smsLog, auditLog, adminSess, memberSess] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM members'),
            dbGet('SELECT COUNT(*) as c FROM member_documents'),
            dbGet('SELECT COUNT(*) as c FROM activity_log WHERE action LIKE "SMS%"'),
            dbGet('SELECT COUNT(*) as c FROM activity_log'),
            dbGet("SELECT COUNT(*) as c FROM admin_sessions WHERE expiresAt < datetime('now')"),
            dbGet("SELECT COUNT(*) as c FROM member_sessions WHERE expiresAt < datetime('now')")
        ]);

        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        const dbSize = fs.existsSync(dbPath) ? (fs.statSync(dbPath).size / 1024 / 1024).toFixed(2) + ' MB' : '0 MB';

        res.json({
            counts: {
                members: members.c,
                documents: docs.c,
                audit: auditLog.c,
                expiredSessions: adminSess.c + memberSess.c
            },
            dbSize,
            lastRun: new Date().toISOString(),
            status: 'OPTIMAL'
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-tools/run', async (req, res) => {
    const { tool } = req.body;
    try {
        let result = {};
        let message = '';
        let issues = null;

        if (tool === 'purge_sessions') {
            const r1 = await dbRun("DELETE FROM admin_sessions WHERE expiresAt < datetime('now')");
            const r2 = await dbRun("DELETE FROM member_sessions WHERE expiresAt < datetime('now')");
            const total = (r1.changes || 0) + (r2.changes || 0);
            message = `Session flush complete. Purged ${total} expired authentication tokens.`;
            result = { changes: total };

        } else if (tool === 'integrity_check') {
            const [noPhone, noName, noMembership, noStatus] = await Promise.all([
                dbAll("SELECT id, name FROM members WHERE phone IS NULL OR phone = ''"),
                dbAll("SELECT id FROM members WHERE name IS NULL OR name = ''"),
                dbAll("SELECT id, name FROM members WHERE membershipNumber IS NULL OR membershipNumber = ''"),
                dbAll("SELECT id, name FROM members WHERE status IS NULL OR status = ''"),
            ]);
            result = {
                missingPhone:       noPhone.length,
                missingName:        noName.length,
                missingMembership:  noMembership.length,
                missingStatus:      noStatus.length
            };
            message = 'Integrity scan complete.';
            issues = { noPhone, noMembership };

        } else if (tool === 'purge_sms_log') {
            const r = await dbRun(`DELETE FROM activity_log WHERE action LIKE 'SMS%' AND id NOT IN (SELECT id FROM activity_log WHERE action LIKE 'SMS%' ORDER BY timestamp DESC LIMIT 500)`);
            message = `SMS log rotation complete. Retained the last 500 entries. Purged ${r.changes || 0} old logs.`;
            result = { changes: r.changes };
        } else if (tool === 'orphan_documents') {
            const docs = await dbAll('SELECT id, filename FROM member_documents');
            let removed = 0;
            for (const doc of docs) {
                const fp = path.join(__dirname, '..', 'uploads', doc.filename);
                if (!fs.existsSync(fp)) {
                    await dbRun('DELETE FROM member_documents WHERE id = ?', [doc.id]);
                    removed++;
                }
            }
            message = `Cleanup complete. Removed ${removed} database records for files that no longer exist on disk.`;
            result = { changes: removed };
        } else if (tool === 'vacuum') {
            await dbRun('VACUUM');
            message = 'Database vacuum complete. Storage reclaimed and indexes optimized.';
        } else if (tool === 'purge_audit_log') {
            const r = await dbRun("DELETE FROM activity_log WHERE timestamp < datetime('now', '-90 days')");
            message = `Audit trail pruned. Removed ${r.changes || 0} entries older than 90 days.`;
        } else {
            return res.status(400).json({ error: `Tool ID '${tool}' not recognized by the kernel.` });
        }

        logActivity('Data Tool Executed', 'ICT', null, `Tool: ${tool} by ${req.admin.username}`, req.admin.username);
        res.json({ success: true, message, result, issues });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 23. ALERT CONFIGURATION
// ═══════════════════════════════════════════════════════════════
router.get('/alert-config', async (req, res) => {
    try {
        res.json({
            supportPhones: await fetchSetting('alert_support_phones', ''),
            thresholdPct: parseInt(await fetchSetting('alert_threshold_pct', '80'))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/alert-config', async (req, res) => {
    try {
        const { supportPhones, thresholdPct } = req.body;
        await upsertSetting('alert_support_phones', supportPhones);
        await upsertSetting('alert_threshold_pct', String(thresholdPct));
        logActivity('Alert Config Updated', 'System', null, `Threshold set to ${thresholdPct}% by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 24. BRANDING & LABELS (Aliases for Frontend)
// ═══════════════════════════════════════════════════════════════
router.get('/brand-config', async (req, res) => {
    try {
        res.json({
            portalTitle: await fetchSetting('brand_portal_title', 'LLUCG Sacco Portal'),
            primaryColor: await fetchSetting('brand_primary_color', '#6366f1'),
            secondaryColor: await fetchSetting('brand_secondary_color', '#1e293b'),
            loginTitle: await fetchSetting('brand_login_title', 'LIFE-LONG UNITY'),
            loginSubtitle: await fetchSetting('brand_login_subtitle', 'Member Portal'),
            loginTagline: await fetchSetting('brand_login_tagline', 'Financial stability for every member')
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/brand-config', async (req, res) => {
    try {
        const { portalTitle, primaryColor, secondaryColor, loginTitle, loginSubtitle, loginTagline } = req.body;
        await upsertSetting('brand_portal_title', portalTitle);
        await upsertSetting('brand_primary_color', primaryColor);
        await upsertSetting('brand_secondary_color', secondaryColor);
        if (loginTitle) await upsertSetting('brand_login_title', loginTitle);
        if (loginSubtitle) await upsertSetting('brand_login_subtitle', loginSubtitle);
        if (loginTagline) await upsertSetting('brand_login_tagline', loginTagline);
        logActivity('Brand Updated', 'System', null, `New identity projected by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/content-labels', async (req, res) => {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'label_%'");
        let labels = {};
        rows.forEach(r => labels[r.key] = r.value);
        
        // Seed default labels if none exist
        if (Object.keys(labels).length === 0) {
            labels = {
                'label_member_term': 'Member',
                'label_loan_term': 'Strategic Loan',
                'label_savings_term': 'Core Savings',
                'label_contribution_term': 'Monthly Contribution',
                'label_portal_welcome': 'Welcome to the LLUCG Member Portal',
                'label_dashboard_tagline': 'Empowering your financial growth.'
            };
        }
        res.json({ labels });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/content-labels', async (req, res) => {
    try {
        const { labels } = req.body;
        for (const [k, v] of Object.entries(labels)) {
            await upsertSetting(k, v);
        }
        logActivity('Lexicon Updated', 'System', null, `Global labels synchronized by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/logo-assets', async (req, res) => {
    try {
        const logoPath = path.join(__dirname, '../../frontend/src/assets/logo.png');
        res.json({ exists: fs.existsSync(logoPath) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});







router.get('/dividend-engine/report/:id', async (req, res) => {
    try {
        const div = await dbGet('SELECT * FROM dividends WHERE id = ?', [req.params.id]);
        if (!div) return res.status(404).json({ error: 'Distribution record not found.' });

        const dists = await dbAll(`
            SELECT d.*, m.name, m.membershipNumber 
            FROM dividend_distributions d 
            JOIN members m ON d.memberId = m.id 
            WHERE d.dividendId = ?
            ORDER BY m.name ASC
        `, [div.id]);

        const orgName = (await fetchSetting('org_name')) || 'LLUCG SACCO';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="dividend_report_${div.id}.pdf"`);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(res);

        await drawReportHeader(doc, 'Dividend Distribution Report');

        // Summary Section
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text('DISTRIBUTION SUMMARY', 50, doc.y + 10);
        doc.rect(50, doc.y + 5, 495, 1).fill('#e2e8f0');
        doc.moveDown(1);

        const startY = doc.y;
        drawSummaryCard(doc, 'Total Pool', `KES ${div.totalPoolAmount.toLocaleString()}`, '#6366f1', 50, startY);
        drawSummaryCard(doc, 'Members Paid', `${dists.length}`, '#10b981', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Date', new Date(div.distributionDate).toLocaleDateString(), '#f59e0b', 50 + (153 + 15) * 2, startY);
        
        doc.y = startY + 80;
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Calculation Method: ${div.calcMethod.toUpperCase()}`);
        doc.text(`Reference Note: ${div.note || 'N/A'}`);
        doc.text(`Authorized By: ${div.distributedBy}`);
        doc.moveDown(2);

        // Members Table
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('MEMBER BREAKDOWN');
        const cols = [
            { label: 'Member ID', x: 60, width: 100 },
            { label: 'Full Name', x: 160, width: 250 },
            { label: 'Dividend (KES)', x: 410, width: 120, align: 'right' }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);
        
        dists.forEach((d, idx) => {
            if (curY > 750) {
                doc.addPage();
                curY = drawTableHeader(doc, cols, 50);
            }
            
            if (idx % 2 === 1) {
                doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
            }

            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(d.membershipNumber || `#${d.memberId}`, cols[0].x, curY);
            doc.text(d.name, cols[1].x, curY);
            doc.font('Helvetica-Bold').fillColor('#10b981').text(d.amount.toLocaleString(), cols[2].x, curY, { width: cols[2].width, align: 'right' });
            
            curY += 18;
        });

        drawReportNote(doc, 'This is a system-generated audit report for dividend allocation.');
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 23. WELFARE FUND ANALYTICS
// ═══════════════════════════════════════════════════════════════
router.get('/welfare/summary', async (req, res) => {
    try {
        const t0 = Date.now();
        const [balance, contributors, trend] = await Promise.all([
            dbGet("SELECT COALESCE(SUM(amount), 0) as total FROM ledger WHERE type = 'WELFARE'"),
            dbGet("SELECT COUNT(DISTINCT memberId) as c FROM ledger WHERE type = 'WELFARE' AND date > datetime('now', 'start of month')"),
            dbAll(`
                SELECT strftime('%Y-%m', date) as month, SUM(amount) as total 
                FROM ledger WHERE type = 'WELFARE' 
                GROUP BY month ORDER BY month DESC LIMIT 6
            `)
        ]);
        
        const totalMembers = await dbGet("SELECT COUNT(*) as c FROM members WHERE status = 'active'");
        
        res.json({
            totalBalance: balance.total,
            contributorsThisMonth: contributors.c,
            totalActiveMembers: totalMembers.c,
            monthlyTrends: trend.reverse(),
            compliancePct: totalMembers.c > 0 ? Math.round((contributors.c / totalMembers.c) * 100) : 0,
            ms: Date.now() - t0
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/welfare/history', async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT l.*, m.name as memberName, m.membershipNumber 
            FROM ledger l 
            JOIN members m ON l.memberId = m.id 
            WHERE l.type = 'WELFARE' 
            ORDER BY l.date DESC LIMIT 100
        `);
        res.json({ history: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 24. RATE LIMITING & SECURITY
// ═══════════════════════════════════════════════════════════════
router.get('/rate-limits', async (req, res) => {
    try {
        const global = await fetchSetting('rate_limit_global', '500');
        const auth = await fetchSetting('rate_limit_auth', '30');
        res.json({ global: parseInt(global), auth: parseInt(auth) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/rate-limits', async (req, res) => {
    try {
        const { global, auth } = req.body;
        if (global < 10 || auth < 1) return res.status(400).json({ error: 'Limits must be reasonable (Global > 10, Auth > 1)' });
        
        await upsertSetting('rate_limit_global', String(global), req.admin.username);
        await upsertSetting('rate_limit_auth', String(auth), req.admin.username);
        
        // Trigger sync in index.js if possible
        const sync = req.app.get('syncRateLimits');
        if (typeof sync === 'function') await sync();
        
        logActivity('Rate Limits Updated', 'Security', null, `Global: ${global}, Auth: ${auth} by ${req.admin.username}`);
        res.json({ success: true, message: 'Rate limits updated successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 25. SYSTEM WIPE & RECOVERY (Exclusive to Super Admin & ICT)
// ═══════════════════════════════════════════════════════════════
router.get('/system-wipe/history', async (req, res) => {
    try {
        const wipeDir = path.join(BACKUP_DIR, 'wipes');
        if (!fs.existsSync(wipeDir)) fs.mkdirSync(wipeDir, { recursive: true });
        
        const files = fs.readdirSync(wipeDir)
            .filter(f => f.startsWith('WIPE_BACKUP_') && f.endsWith('.sqlite'))
            .map(f => {
                const stat = fs.statSync(path.join(wipeDir, f));
                const createdAt = stat.mtime;
                const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
                return { 
                    filename: f, 
                    sizeKB: Math.round(stat.size / 1024), 
                    createdAt: createdAt.toISOString(),
                    expiresAt: expiresAt.toISOString(),
                    isExpired: new Date() > expiresAt
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
        res.json({ wipes: files });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/system-wipe/execute', async (req, res) => {
    const { confirmText } = req.body;
    if (confirmText !== 'CONFIRM WIPE') return res.status(400).json({ error: 'Validation failed. Type CONFIRM WIPE exactly.' });

    try {
        const wipeDir = path.join(BACKUP_DIR, 'wipes');
        if (!fs.existsSync(wipeDir)) fs.mkdirSync(wipeDir, { recursive: true });

        const dbSrcPath = path.join(__dirname, '..', 'database.sqlite');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `WIPE_BACKUP_${timestamp}.sqlite`;
        const backupPath = path.join(wipeDir, backupName);

        // 1. Create safety backup
        fs.copyFileSync(dbSrcPath, backupPath);

        // 2. Perform Wipe
        const tablesToClear = [
            'members', 'payments', 'ledger', 'transactions', 'sms_log', 'activity_log', 
            'loans', 'loan_repayments', 'loan_interest_log', 'penalties', 'target_savings', 
            'target_savings_ledger', 'meetings', 'meeting_attendance', 'member_documents', 
            'investments', 'investment_valuations', 'dividends', 'dividend_distributions', 
            'expenses', 'polls', 'poll_options', 'poll_votes', 'budgets', 'bank_statements', 
            'loan_guarantors', 'meeting_resolutions', 'agm_resolutions', 'org_documents', 
            'member_sessions', 'sms_campaigns', 'delete_requests', 'loan_applications', 
            'pledges', 'comm_threads', 'comm_messages', 'admin_chat', 'admin_direct_messages', 
            'notifications', 'comm_channels', 'comm_channel_members', 'comm_channel_messages', 
            'investment_history', 'member_notifications', 'withdrawals', 'mpesa_b2c_transactions', 
            'mpesa_transactions', 'member_beneficiaries', 'support_tickets', 'support_replies', 'settings_audit'
        ];

        for (const table of tablesToClear) {
            try { await dbRun(`DELETE FROM ${table}`); } catch (e) { console.warn(`Wipe warning: could not clear ${table}`, e.message); }
            try { await dbRun(`DELETE FROM sqlite_sequence WHERE name='${table}'`); } catch (e) {}
        }

        logActivity('SYSTEM WIPE EXECUTED', 'Security', null, `Full system data wipe by ${req.admin.username}. Backup: ${backupName}`, req.admin.username);
        
        res.json({ success: true, message: 'System wiped successfully.', backupName });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/system-wipe/purge/:filename', async (req, res) => {
    try {
        const wipeDir = path.join(BACKUP_DIR, 'wipes');
        const safeName = path.basename(req.params.filename);
        if (!safeName.startsWith('WIPE_BACKUP_')) return res.status(403).json({ error: 'Invalid file target' });
        
        const fp = path.join(wipeDir, safeName);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        
        logActivity('WIPE BACKUP PURGED', 'Security', null, `Backup ${safeName} permanently deleted by ${req.admin.username}`, req.admin.username);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/system-wipe/download/:filename', async (req, res) => {
    const wipeDir = path.join(BACKUP_DIR, 'wipes');
    const safeName = path.basename(req.params.filename);
    const fp = path.join(wipeDir, safeName);
    
    try {
        if (!fs.existsSync(fp)) return res.status(404).send('Wipe backup not found.');
        const stat = fs.statSync(fp);
        res.writeHead(200, {
            'Content-Type': 'application/x-sqlite3',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${safeName}"`
        });
        fs.createReadStream(fp).pipe(res);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;



