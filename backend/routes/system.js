const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const { SECRET, MEMBER_SECRET } = require('../config');
const { dbAll, dbGet, dbRun, getSystemSettings } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { drawReportHeader, drawTableHeader, drawPageFooter } = require('../utils/pdf');
const { authRequired, superadminRequired, ictRequired } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    next();
};

// --- Technical & Health ---

async function getMaintenanceStatus() {
    const maintenance = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_mode'");
    const resolution  = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_resolution'");
    const message     = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_message'");
    // Return ALL settings so frontend has one source of truth for features, labels, announcements, brand
    const allSettings = await dbAll('SELECT key, value FROM settings');
    const settings = {};
    allSettings.forEach(t => settings[t.key] = t.value);

    return {
        maintenanceMode:       maintenance?.value === 'true',
        maintenanceResolution: resolution?.value  || 'shortly',
        maintenanceMessage:    message?.value      || 'The system is currently undergoing essential maintenance.',
        features: settings
    };
}

router.get('/status', async (req, res) => {
    try {
        const status = await getMaintenanceStatus();
        res.json(status);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/health', authRequired, ictRequired, async (req, res) => {
    try {
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        const stats = fs.statSync(dbPath);
        const [memberCount, logCount] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM members'),
            dbGet('SELECT COUNT(*) as c FROM activity_log')
        ]);
        
        res.json({
            uptime: Math.round(process.uptime()),
            dbSize: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
            totalMembers: memberCount.c,
            totalLogs: logCount.c,
            environment: process.env.NODE_ENV || 'production',
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/backup', authRequired, ictRequired, async (req, res) => {
    try {
        const dbPath = path.join(__dirname, '..', 'database.sqlite');
        if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Database file not found' });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Disposition', `attachment; filename="backup_${timestamp}.sqlite"`);
        res.setHeader('Content-Type', 'application/x-sqlite3');
        const stream = fs.createReadStream(dbPath);
        stream.pipe(res);
        logActivity('Data Backup', 'System', null, `Manual snapshot downloaded by ${req.admin.username}`);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/security-stats', authRequired, ictRequired, async (req, res) => {
    try {
        const [mfa, resets, failures, recentFailures] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM admin_users WHERE totp_enabled = 1'),
            dbGet('SELECT COUNT(*) as c FROM members WHERE must_change_password = 1'),
            dbGet("SELECT COUNT(*) as c FROM activity_log WHERE (action LIKE '%Failure%' OR action LIKE '%Unauthorized%') AND timestamp > datetime('now', '-24 hours')"),
            dbAll("SELECT * FROM activity_log WHERE (action LIKE '%Failure%' OR action LIKE '%Unauthorized%') ORDER BY timestamp DESC LIMIT 10")
        ]);
        const totalAdmins = await dbGet('SELECT COUNT(*) as c FROM admin_users');
        const maintenance = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_mode'");
        const resolution = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_resolution'");
        const message = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_message'");
        
        res.json({
            mfaAdoption: {
                enabled: mfa.c,
                total: totalAdmins.c,
                percentage: totalAdmins.c > 0 ? Math.round((mfa.c / totalAdmins.c) * 100) : 0
            },
            pendingResets: resets.c,
            recentThreats: failures.c,
            recentFailures,
            maintenanceMode: maintenance?.value === 'true',
            maintenanceResolution: resolution?.value || 'shortly',
            maintenanceMessage: message?.value || 'The Member Portal is currently undergoing essential system maintenance to enhance security and performance.'
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/maintenance', authRequired, ictRequired, async (req, res) => {
    const { enabled, resolutionTime, maintenanceMessage } = req.body;
    try {
        await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['maintenance_mode', String(enabled)]);
        if (enabled) {
            if (resolutionTime) await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['maintenance_resolution', resolutionTime]);
            if (maintenanceMessage) await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['maintenance_message', maintenanceMessage]);
        }
        logActivity('Maintenance Toggled', 'System', null, `Maintenance mode set to ${enabled} by ${req.admin.username}`, req.admin.username);
        res.json({ message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/member-resets', authRequired, async (req, res) => {
    try {
        const members = await dbAll(
            `SELECT id, name, phone, reset_otp, reset_otp_expiry, mfa_token FROM members WHERE reset_otp IS NOT NULL OR mfa_token IS NOT NULL`
        );
        
        let codes = [];
        for (const m of members) {
            if (m.reset_otp && new Date(m.reset_otp_expiry) > new Date()) {
                codes.push({
                    id: `reset_${m.id}`,
                    member_id: m.id,
                    name: m.name,
                    phone: m.phone,
                    code: m.reset_otp,
                    type: 'Password Reset',
                    expiry: m.reset_otp_expiry
                });
            }
            if (m.mfa_token && m.mfa_token.startsWith('SMS:')) {
                const [prefix, otp, timestamp] = m.mfa_token.split(':');
                const expiryTime = parseInt(timestamp) + (5 * 60 * 1000); // 5 mins validity
                if (Date.now() < expiryTime) {
                    codes.push({
                        id: `2fa_${m.id}`,
                        member_id: m.id,
                        name: m.name,
                        phone: m.phone,
                        code: otp,
                        type: 'Login Security',
                        expiry: new Date(expiryTime).toISOString()
                    });
                }
            }
            if (m.mfa_token && m.mfa_token.startsWith('TRANS:')) {
                const [prefix, otp, timestamp] = m.mfa_token.split(':');
                const expiryTime = parseInt(timestamp) + (15 * 60 * 1000); // 15 mins
                codes.push({
                    id: `loan_${m.id}_${timestamp}`,
                    member_id: m.id,
                    name: m.name,
                    phone: m.phone,
                    code: otp,
                    type: 'Loan Authorization',
                    expiry: new Date(expiryTime).toISOString()
                });
            }
        }
        
        // Fetch Admin MFA/Resets
        const admins = await dbAll(
            `SELECT id, username as name, phone, email, mfa_token FROM admin_users WHERE mfa_token IS NOT NULL`
        );
        for (const a of admins) {
            const [prefix, otp, timestamp] = (a.mfa_token || '').split(':');
            if (!timestamp) continue;
            const expiryTime = parseInt(timestamp) + (5 * 60 * 1000);
            if (Date.now() < expiryTime) {
                codes.push({
                    id: `admin_${a.id}_${timestamp}`,
                    member_id: `Admin: ${a.name}`,
                    name: `[ADMIN] ${a.name}`,
                    phone: a.phone || a.email || 'N/A',
                    code: otp,
                    type: prefix === 'RESET' ? 'Admin Password Reset' : 'Admin Login Security',
                    expiry: new Date(expiryTime).toISOString()
                });
            }
        }

        res.json({ success: true, resets: codes });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/locked-accounts', authRequired, ictRequired, async (req, res) => {
    try {
        const [adminLocked, memberLocked] = await Promise.all([
            dbAll("SELECT id, username, 'admin' as type, locked_until FROM admin_users WHERE locked_until IS NOT NULL"),
            dbAll("SELECT id, name as username, 'member' as type, locked_until FROM members WHERE locked_until IS NOT NULL")
        ]);
        res.json({ locked: [...adminLocked, ...memberLocked] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sessions', authRequired, ictRequired, async (req, res) => {
    try {
        const [adminSessions, memberSessions] = await Promise.all([
            dbAll(`
                SELECT s.*, u.username as name, 'admin' as type 
                FROM admin_sessions s 
                JOIN admin_users u ON s.adminId = u.id 
                WHERE s.revoked = 0 AND s.expiresAt > datetime('now')
                ORDER BY s.createdAt DESC
            `),
            dbAll(`
                SELECT s.*, m.name, 'member' as type 
                FROM member_sessions s 
                JOIN members m ON s.memberId = m.id 
                WHERE s.revoked = 0 AND s.expiresAt > datetime('now')
                ORDER BY s.createdAt DESC
            `)
        ]);
        res.json({ sessions: [...adminSessions, ...memberSessions] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sessions/revoke', authRequired, ictRequired, async (req, res) => {
    const { sessionId, type } = req.body;
    if (!sessionId || !type) return res.status(400).json({ error: 'sessionId and type required.' });
    
    try {
        const table = type === 'admin' ? 'admin_sessions' : 'member_sessions';
        await dbRun(`UPDATE ${table} SET revoked = 1 WHERE id = ?`, [sessionId]);
        logActivity('Session Revoked', 'Security', sessionId, `ICT Admin ${req.admin.username} revoked a ${type} session`, req.admin.username);
        res.json({ message: 'Session revoked successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/unlock-account', authRequired, ictRequired, async (req, res) => {
    const { userId, type } = req.body;
    if (!userId || !type) return res.status(400).json({ error: 'userId and type required.' });
    
    try {
        const table = type === 'admin' ? 'admin_users' : 'members';
        await dbRun(`UPDATE ${table} SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [userId]);
        logActivity('Account Unlocked', 'Security', userId, `ICT Admin ${req.admin.username} unlocked a ${type} account`, req.admin.username);
        res.json({ message: 'Account unlocked successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Settings ---

router.get('/', authRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT key, value FROM settings');
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json({ settings });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings', [authRequired, body('settings').isObject(), validate], async (req, res) => {
    const { settings } = req.body;
    const changedBy = req.admin?.username || 'system';
    try {
        for (const [key, value] of Object.entries(settings)) {
            // Capture old value for audit
            const existing = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
            const oldValue = existing?.value ?? null;
            await dbRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
            // Write to settings_audit table so Financial Governance can track changes
            try {
                await dbRun(
                    'INSERT INTO settings_audit (setting_key, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?)',
                    [key, oldValue, String(value), changedBy, new Date().toISOString()]
                );
            } catch (_) { /* table may not exist yet — safe to ignore */ }
        }
        logActivity('Updated Settings', 'Settings', null, `Keys: ${Object.keys(settings).join(', ')} by ${changedBy}`, changedBy);
        res.json({ message: 'Settings saved.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Notifications ---

router.get('/notifications', authRequired, async (req, res) => {
    try {
        const notifications = [];
        const overdueLoans = await dbAll(`SELECT l.*, m.name FROM loans l JOIN members m ON l.memberId = m.id WHERE l.status='active' AND l.dueDate < date('now')`);
        overdueLoans.forEach(l => notifications.push({ level: 'danger', message: `Loan #${l.id} (${l.name}) is overdue.` }));
        res.json({ notifications, totalCount: notifications.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Audit & Logs ---

router.get('/audit/logs', authRequired, async (req, res) => {
    try {
        const logs = await dbAll('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 500');
        res.json({ logs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audit/sms', authRequired, async (req, res) => {
    try {
        const logs = await dbAll('SELECT * FROM sms_log ORDER BY timestamp DESC LIMIT 500');
        res.json({ logs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audit/export.pdf', authRequired, superadminRequired, async (req, res) => {
    try {
        const [logs, stats] = await Promise.all([
            dbAll('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 200'),
            dbGet('SELECT COUNT(*) as c FROM activity_log')
        ]);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="audit_trail.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);
        await drawReportHeader(doc, 'System Audit Trail');
        
        const cols = [
            { label: 'Date', x: 60, width: 80 },
            { label: 'Action', x: 140, width: 100 },
            { label: 'Entity', x: 240, width: 60 },
            { label: 'Details', x: 300, width: 170 },
            { label: 'By', x: 470, width: 60 }
        ];
        let curY = drawTableHeader(doc, cols, doc.y);
        logs.forEach(l => {
            if (curY > 740) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
            doc.fontSize(7).font('Helvetica').fillColor('#334155');
            doc.text(new Date(l.timestamp).toLocaleDateString(), cols[0].x, curY);
            doc.text(l.action, cols[1].x, curY);
            doc.text(l.entity, cols[2].x, curY);
            doc.text(l.details.substring(0, 40), cols[3].x, curY);
            doc.text(l.performed_by, cols[4].x, curY);
            curY += 15;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Document Access ---

router.get('/doc/:filename', (req, res, next) => {
    let token = req.query.token;
    if (!token) {
        const header = req.headers['authorization'];
        if (header) token = header.split(' ')[1];
    }
    if (!token) return res.status(401).json({ error: 'Missing token' });
    try {
        req.admin = jwt.verify(token, SECRET);
        return next(); 
    } catch (e) {}
    try {
        req.member = jwt.verify(token, MEMBER_SECRET);
        return next();
    } catch (e) {}
    return res.status(401).json({ error: 'Unauthorized token' });
}, (req, res) => {
    const fp = path.join(__dirname, '..', 'uploads', req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).send('File not found');
    res.sendFile(fp);
});

module.exports = router;
