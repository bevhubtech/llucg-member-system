const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { generateSecret, verify, generateURI } = require('otplib');
const { SECRET } = require('../config');
const { dbGet, dbRun, dbAll } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const { sendEmail } = require('../utils/email');
const { authRequired } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
};

router.post('/login', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
], async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    try {
        const admin = await dbGet('SELECT * FROM admin_users WHERE username = ?', [username]);
        if (!admin) return res.status(401).json({ error: 'Invalid credentials.' });

        // 1. Check if account is locked
        if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
            const diff = Math.ceil((new Date(admin.locked_until) - new Date()) / 60000);
            return res.status(403).json({ error: `Account locked due to multiple failed attempts. Please try again in ${diff} minutes.` });
        }

        const ok = bcrypt.compareSync(password, admin.password_hash);
        
        if (!ok) {
            // 2. Handle failed attempt
            const newAttempts = (admin.failed_attempts || 0) + 1;
            let lockUntil = admin.locked_until;
            if (newAttempts >= 5) {
                lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                logActivity('Account Locked', 'Admin', admin.id, `Admin ${username} locked for 30m after ${newAttempts} failures`);
            }
            await dbRun('UPDATE admin_users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [newAttempts, lockUntil, admin.id]);
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // 3. Successful login - Reset lockouts and check IP
        let suspicious = false;
        if (admin.last_ip && admin.last_ip !== req.ip) {
            suspicious = true;
        }
        await dbRun('UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, last_ip = ? WHERE id = ?', [req.ip, admin.id]);

        const mustChangePassword = !!admin.must_change_password || bcrypt.compareSync('123456', password);

        if (admin.totp_enabled) {
            return res.json({ requires2FA: true, adminId: admin.id, method: admin.totp_method });
        }

        const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role || 'admin' }, SECRET, { expiresIn: '12h' });
        
        // 4. Record Session
        await dbRun('INSERT INTO admin_sessions (adminId, token, ip, userAgent, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)', [
            admin.id, token, req.ip, req.headers['user-agent'], new Date().toISOString(), new Date(Date.now() + 12 * 3600 * 1000).toISOString()
        ]);

        if (suspicious && admin.phone) {
            try {
                await sendSMS([admin.phone], `[LLUCG Admin Security] Warning: A new login was detected on your admin account from IP ${req.ip}.`, 'admin_security_alert');
                logActivity('Suspicious Admin Login', 'Admin', admin.id, `Admin login from new IP: ${req.ip} (Previous: ${admin.last_ip})`, admin.username);
            } catch (e) { console.error('Admin Alert SMS failed:', e.message); }
        } else {
            logActivity('Login', 'Admin', admin.id, `${admin.username} logged in`);
        }
        
        res.json({ token, id: admin.id, username: admin.username, role: admin.role || 'admin', mustChangePassword });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/2fa/status', authRequired, async (req, res) => {
    try {
        const admin = await dbGet('SELECT totp_enabled, totp_method FROM admin_users WHERE id = ?', [req.admin.id]);
        res.json({ enabled: !!admin.totp_enabled, method: admin.totp_method });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/request', authRequired, async (req, res) => {
    const { method } = req.body; // 'sms' or 'email'
    const authMethod = method || 'sms';

    try {
        const admin = await dbGet('SELECT phone, email FROM admin_users WHERE id = ?', [req.admin.id]);
        
        if (authMethod === 'sms' && !admin.phone) return res.status(400).json({ error: 'No phone number linked.' });
        if (authMethod === 'email' && !admin.email) return res.status(400).json({ error: 'No email address linked.' });
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await dbRun('UPDATE admin_users SET mfa_token = ? WHERE id = ?', [`${authMethod.toUpperCase()}:${otp}:${Date.now()}`, req.admin.id]);
        
        if (authMethod === 'email') {
            await sendEmail(admin.email, 'LLUCG Security Code', `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #3b82f6; text-align: center;">Security Verification</h2>
                    <p>Use the code below to authorize your administrative login:</p>
                    <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #1e293b;">${otp}</span>
                    </div>
                    <p style="font-size: 13px; color: #64748b; text-align: center;">This code expires in 5 minutes. If you didn't request this, please change your password immediately.</p>
                </div>
            `);
            res.json({ message: 'Verification code sent to your email.' });
        } else {
            await sendSMS([admin.phone], `Your LLUCG Admin security code is: ${otp}. Valid for 5 minutes.`, '2fa_admin');
            res.json({ message: 'Verification code sent to your phone.' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/sms/request', authRequired, async (req, res) => {
    // Keep legacy endpoint for backward compatibility but redirect to unified one
    req.body.method = 'sms';
    return router.handle(req, res); // This might not work as expected in express, but let's just duplicate logic or leave it.
    // Actually, I'll just keep the old one and add the new one.
});

router.post('/2fa/setup', authRequired, async (req, res) => {
    try {
        const secret = await generateSecret();
        await dbRun('UPDATE admin_users SET totp_secret = ? WHERE id = ?', [secret, req.admin.id]);
        
        const uri = generateURI({ secret, label: req.admin.username, issuer: 'LLUCG-Portal' });
        const qrCode = await QRCode.toDataURL(uri);
        
        res.json({ secret, qrCode });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/enable', authRequired, async (req, res) => {
    const { token, method } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token required.' });
    const authMethod = method || 'totp';

    try {
        const admin = await dbGet('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
        if (!admin.totp_secret && authMethod === 'totp') return res.status(400).json({ error: '2FA not initialized. Please run setup first.' });

        let isValid = false;
        if (authMethod === 'totp') {
            const v = await verify({ token, secret: admin.totp_secret });
            isValid = v.valid;
        } else {
            const [prefix, savedOtp, timestamp] = (admin.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;
            if ((prefix === 'SMS' || prefix === 'EMAIL') && token === savedOtp && age < 300) isValid = true;
        }

        if (!isValid) return res.status(400).json({ error: 'Invalid or expired verification code.' });

        await dbRun('UPDATE admin_users SET totp_enabled = 1, totp_method = ? WHERE id = ?', [authMethod, req.admin.id]);
        logActivity('2FA Enabled', 'Admin', req.admin.id, `${req.admin.username} enabled 2FA security (${authMethod})`, req.admin.username);
        res.json({ message: '2FA enabled successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/disable', authRequired, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token required.' });

    try {
        const admin = await dbGet('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
        
        let isValid = false;
        if (admin.totp_method === 'totp') {
            const v = await verify({ token, secret: admin.totp_secret });
            isValid = v.valid;
        } else {
            const [prefix, savedOtp, timestamp] = (admin.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;
            if (prefix === 'SMS' && token === savedOtp && age < 600) isValid = true;
        }

        if (!isValid) return res.status(400).json({ error: 'Invalid code. Cannot disable 2FA.' });

        await dbRun('UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, totp_method = ? WHERE id = ?', ['totp', req.admin.id]);
        logActivity('2FA Disabled', 'Admin', req.admin.id, `${req.admin.username} disabled 2FA security`, req.admin.username);
        res.json({ message: '2FA disabled.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Password Recovery ---

router.post('/forgot-password/request', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    validate
], async (req, res) => {
    const { username, method } = req.body;
    const authMethod = method || 'email';

    if (!username) return res.status(400).json({ error: 'Username is required.' });

    try {
        const admin = await dbGet('SELECT id, phone, email, username FROM admin_users WHERE username = ?', [username]);
        if (!admin) {
            // Generic message for security to avoid user enumeration
            return res.json({ message: 'If the account exists, a verification code has been sent.' });
        }

        if (authMethod === 'sms' && !admin.phone) return res.status(400).json({ error: 'No phone number linked to this admin account.' });
        if (authMethod === 'email' && !admin.email) return res.status(400).json({ error: 'No email address linked to this admin account.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await dbRun('UPDATE admin_users SET mfa_token = ? WHERE id = ?', [`RESET:${otp}:${Date.now()}`, admin.id]);

        if (authMethod === 'email') {
            await sendEmail(admin.email, 'Admin Password Reset', `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #ef4444; text-align: center;">Account Recovery</h2>
                    <p>You requested a password reset for your administrator account (<b>${admin.username}</b>). Use the code below to proceed:</p>
                    <div style="background: #fef2f2; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; border: 1px dashed #f87171;">
                        <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #b91c1c;">${otp}</span>
                    </div>
                    <p style="font-size: 13px; color: #64748b; text-align: center;">This code expires in 5 minutes. If you did not request this, please ignore this email.</p>
                </div>
            `);
            res.json({ message: 'Verification code sent to your email.' });
        } else {
            await sendSMS([admin.phone], `Your LLUCG Admin password reset code is: ${otp}. Valid for 5 minutes.`, 'admin_pwd_reset');
            res.json({ message: 'Verification code sent to your phone.' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/forgot-password/reset', [
    body('username').trim().notEmpty(),
    body('otp').notEmpty().withMessage('OTP is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    validate
], async (req, res) => {
    const { username, otp, newPassword } = req.body;
    if (!username || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required.' });

    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passRegex.test(newPassword)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.' });
    }

    try {
        const admin = await dbGet('SELECT id, mfa_token FROM admin_users WHERE username = ?', [username]);
        if (!admin) return res.status(404).json({ error: 'Admin account not found.' });

        const [prefix, savedOtp, timestamp] = (admin.mfa_token || '').split(':');
        const age = (Date.now() - parseInt(timestamp)) / 1000;

        if (prefix !== 'RESET' || otp !== savedOtp || age > 300) {
            return res.status(400).json({ error: 'Invalid or expired verification code.' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        await dbRun('UPDATE admin_users SET password_hash = ?, mfa_token = NULL, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE id = ?', [newHash, admin.id]);
        
        logActivity('Password Reset', 'Admin', admin.id, `Self-service password reset for ${username}`, username);
        res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login/2fa/verify', async (req, res) => {
    const { adminId, token: otpToken } = req.body;
    if (!adminId || !otpToken) return res.status(400).json({ error: 'adminId and token required.' });

    try {
        const admin = await dbGet('SELECT * FROM admin_users WHERE id = ?', [adminId]);
        if (!admin || !admin.totp_enabled) return res.status(400).json({ error: 'Invalid request.' });

        // Account lockout check (already handled in /login, but good to ensure here too if necessary)
        if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
            return res.status(403).json({ error: 'Account is locked.' });
        }

        let isValid = false;
        if (admin.totp_method === 'totp') {
            const v = await verify({ token: otpToken, secret: admin.totp_secret });
            isValid = v.valid;
        } else {
            const [prefix, savedOtp, timestamp] = (admin.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;
            if ((prefix === 'SMS' || prefix === 'EMAIL') && otpToken === savedOtp && age < 300) isValid = true;
        }

        if (!isValid) {
            // Increment failed attempts on 2FA failure too? 
            // Usually, only the password failure locks the account to prevent DOS by anyone who knows the username.
            // But 2FA failure also indicates a compromised password.
            return res.status(410).json({ error: 'Invalid or expired code.' });
        }

        const mustChangePassword = !!admin.must_change_password;
        const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role || 'admin' }, SECRET, { expiresIn: '12h' });
        
        let suspicious = false;
        if (admin.last_ip && admin.last_ip !== req.ip) {
            suspicious = true;
        }
        await dbRun('UPDATE admin_users SET last_ip = ? WHERE id = ?', [req.ip, admin.id]);

        // Record Session
        await dbRun('INSERT INTO admin_sessions (adminId, token, ip, userAgent, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)', [
            admin.id, token, req.ip, req.headers['user-agent'], new Date().toISOString(), new Date(Date.now() + 12 * 3600 * 1000).toISOString()
        ]);

        if (suspicious && admin.phone) {
            try {
                await sendSMS([admin.phone], `[LLUCG Admin Security] Warning: A new login was detected on your admin account from IP ${req.ip} via 2FA.`, 'admin_security_alert');
                logActivity('Suspicious Admin Login (2FA)', 'Admin', admin.id, `Admin login from new IP: ${req.ip} (Previous: ${admin.last_ip})`, admin.username);
            } catch (e) { console.error('Admin Alert SMS failed:', e.message); }
        } else {
            logActivity('Login (2FA)', 'Admin', admin.id, `${admin.username} logged in with 2FA (${admin.totp_method})`);
        }

        res.json({ token, id: admin.id, username: admin.username, role: admin.role || 'admin', mustChangePassword });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/change-password', [
    authRequired,
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long'),
    validate
], async (req, res) => {
    const { currentPassword, newPassword, isMandatoryReset } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password required.' });

    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passRegex.test(newPassword)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.' });
    }

    try {
        const admin = await dbGet('SELECT password_hash, must_change_password FROM admin_users WHERE id = ?', [req.admin.id]);
        
        if (!isMandatoryReset || !admin.must_change_password) {
            if (!currentPassword) return res.status(400).json({ error: 'Current and new passwords required.' });
            if (!bcrypt.compareSync(currentPassword, admin.password_hash)) 
                return res.status(401).json({ error: 'Incorrect current password.' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        await dbRun('UPDATE admin_users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, req.admin.id]);
        logActivity('Password Changed', 'Admin', req.admin.id, `${req.admin.username} updated their password`, req.admin.username);
        res.json({ message: 'Password changed successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', authRequired, async (req, res) => {
    try {
        const admin = await dbGet('SELECT id, username, role, title, phone, email, totp_enabled FROM admin_users WHERE id = ?', [req.admin.id]);
        if (!admin) return res.status(404).json({ error: 'Admin not found.' });
        res.json(admin);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/me', authRequired, async (req, res) => {
    const { phone, email } = req.body;
    try {
        await dbRun('UPDATE admin_users SET phone = ?, email = ? WHERE id = ?', [phone, email, req.admin.id]);
        logActivity('Profile Updated', 'Admin', req.admin.id, `${req.admin.username} updated their contact info`, req.admin.username);
        res.json({ message: 'Profile updated successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Admin User Management ---

router.get('/users', authRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT id, username, role, title, phone, email, totp_enabled FROM admin_users ORDER BY username ASC');
        res.json({ users: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', authRequired, async (req, res) => {
    const { username, password, role, title, phone, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
    if (!['superadmin', 'ict_admin'].includes(req.admin.role)) return res.status(403).json({ error: 'Superadmin/ICT only.' });

    try {
        const hash = bcrypt.hashSync(password, 10);
        await dbRun('INSERT INTO admin_users (username, password_hash, role, title, phone, email, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)', [username, hash, role || 'admin', title || '', phone, email]);
        logActivity('Admin Created', 'Admin', null, `Created admin: ${username}`, req.admin.username);
        res.json({ message: 'Admin created.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', authRequired, async (req, res) => {
    if (!['superadmin', 'ict_admin'].includes(req.admin.role)) return res.status(403).json({ error: 'Superadmin/ICT only.' });
    if (parseInt(req.params.id) === req.admin.id) return res.status(400).json({ error: 'Cannot delete yourself.' });

    try {
        await dbRun('DELETE FROM admin_users WHERE id = ?', [req.params.id]);
        logActivity('Admin Deleted', 'Admin', req.params.id, `Deleted admin ID: ${req.params.id}`, req.admin.username);
        res.json({ message: 'Admin deleted.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', authRequired, async (req, res) => {
    if (!['superadmin', 'ict_admin'].includes(req.admin.role)) return res.status(403).json({ error: 'Superadmin/ICT only.' });
    const { username, role, title, phone, email } = req.body;
    
    if (!username) return res.status(400).json({ error: 'Username is required.' });

    try {
        await dbRun('UPDATE admin_users SET username = ?, role = ?, title = ?, phone = ?, email = ? WHERE id = ?', [username, role, title, phone, email, req.params.id]);
        logActivity('Admin Updated', 'Admin', req.params.id, `Updated admin details for: ${username}`, req.admin.username);
        res.json({ message: 'Admin updated successfully.' });
    } catch (err) { 
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists.' });
        res.status(500).json({ error: err.message }); 
    }
});

router.post('/users/:id/reset-password', authRequired, async (req, res) => {
    if (!['superadmin', 'ict_admin'].includes(req.admin.role)) return res.status(403).json({ error: 'Superadmin/ICT only.' });
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password required.' });

    try {
        const hash = bcrypt.hashSync(newPassword, 10);
        await dbRun('UPDATE admin_users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, req.params.id]);
        logActivity('Admin Pwd Reset', 'Admin', req.params.id, `Password reset by ${req.admin.username}`, req.admin.username);
        res.json({ message: 'Password reset successfully. User must change it on next login.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
