const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { verify, generateURI, generateSecret } = require('otplib');
const { MEMBER_SECRET } = require('../config');
const { dbGet, dbRun, normalizePhone } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const { sendEmail } = require('../utils/email');
const { memberAuthRequired } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
};

router.post('/register', [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    validate
], async (req, res) => {
    const { name, phone, idNumber, dob, email } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });

    try {
        const normPhone = normalizePhone(phone);
        const existing = await dbGet('SELECT id FROM members WHERE phone = ?', [normPhone]);
        if (existing) return res.status(400).json({ error: 'A member with this phone number already exists.' });

        const now = new Date().toISOString();
        const nextDue = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        
        const r = await dbRun(
            'INSERT INTO members (name, phone, joinDate, nextDueDate, status, idNumber, dateOfBirth, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, normPhone, now, nextDue, 'pending', idNumber || null, dob || null, email || null]
        );

        logActivity('Self-Registration', 'Member', r.lastID, `New application from ${name} (${normPhone})`, 'System');
        
        // Notify member
        try {
            await sendSMS([normPhone], `Welcome to LLUCG, ${name}! Your membership application has been received and is pending approval. You will be notified once activated.`, 'registration');
        } catch (e) {}

        res.json({ success: true, message: 'Registration submitted successfully. Please wait for admin approval.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', [
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('pin').notEmpty().withMessage('PIN/Password is required'),
    validate
], async (req, res) => {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: 'Phone and PIN required.' });

    try {
        const normPhone = normalizePhone(phone);
        const member = await dbGet('SELECT * FROM members WHERE phone = ?', [normPhone]);
        if (!member) return res.status(401).json({ error: 'Member not found.' });

        // 1. Check if account is active
        if (member.status !== 'active') {
            return res.status(403).json({ 
                error: member.status === 'pending' 
                    ? 'Your account is pending approval. You will receive an SMS once activated.' 
                    : 'Your account is currently disabled. Please contact support.' 
            });
        }

        // 2. Check if account is locked
        if (member.locked_until && new Date(member.locked_until) > new Date()) {
            const diff = Math.ceil((new Date(member.locked_until) - new Date()) / 60000);
            return res.status(403).json({ error: `Account locked due to multiple failed attempts. Please try again in ${diff} minutes.` });
        }

        let ok = false;
        if (!member.password_hash) {
            if (pin === '1234') ok = true;
            else return res.status(401).json({ error: 'Invalid PIN.' });
        } else {
            ok = bcrypt.compareSync(pin, member.password_hash);
        }

        if (!ok) {
            // 2. Handle failed attempt
            const newAttempts = (member.failed_attempts || 0) + 1;
            let lockUntil = member.locked_until;
            if (newAttempts >= 5) {
                lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                logActivity('Account Locked', 'Member', member.id, `Member ${member.name} locked for 30m after ${newAttempts} failures`, member.name);
            }
            await dbRun('UPDATE members SET failed_attempts = ?, locked_until = ? WHERE id = ?', [newAttempts, lockUntil, member.id]);
            return res.status(401).json({ error: 'Invalid PIN.' });
        }

        // 3. Successful login - Reset lockouts and check IP
        let suspicious = false;
        if (member.last_ip && member.last_ip !== req.ip) {
            suspicious = true; // IP changed significantly
        }
        await dbRun('UPDATE members SET failed_attempts = 0, locked_until = NULL, last_login = ?, last_ip = ? WHERE id = ?', [new Date().toISOString(), req.ip, member.id]);

        const mustChange = !!member.must_change_password || (!member.password_hash && pin === '1234');

        if (member.totp_enabled) {
            if (member.totp_method === 'sms') {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                await dbRun('UPDATE members SET mfa_token = ? WHERE id = ?', [`SMS:${otp}:${Date.now()}`, member.id]);
                try {
                    await sendSMS([member.phone], `Your LLUCG login code is: ${otp}. Valid for 5 minutes.`);
                } catch (smsErr) {
                    console.error('Login SMS failed:', smsErr.message);
                }
            }
            return res.json({ requires2FA: true, memberId: member.id, method: member.totp_method });
        }

        const token = jwt.sign({ id: member.id, name: member.name, phone: member.phone }, MEMBER_SECRET, { expiresIn: '24h' });
        
        // 4. Record Session & Send Alerts
        await dbRun('INSERT INTO member_sessions (memberId, token, ip, userAgent, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)', [
            member.id, token, req.ip, req.headers['user-agent'], new Date().toISOString(), new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        ]);

        if (suspicious) {
            try {
                await sendSMS([member.phone], `[LLUCG Security] A new login was detected on your account from IP ${req.ip}. If this wasn't you, reset your PIN immediately.`, 'security_alert');
                logActivity('Suspicious Login', 'Member', member.id, `Login from new IP: ${req.ip} (Previous: ${member.last_ip})`, member.name);
            } catch (e) { console.error('Alert SMS failed:', e.message); }
        } else {
            logActivity('Member Login', 'Member', member.id, `${member.name} logged into portal`, member.name);
        }

        res.json({ token, id: member.id, name: member.name, mustChangePassword: mustChange });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/forgot-password/request', [
    body('phone').trim().notEmpty().withMessage('Phone or email is required'),
    validate
], async (req, res) => {
    const { phone, deliveryMethod } = req.body;
    const method = deliveryMethod || 'sms';

    if (!phone) return res.status(400).json({ error: 'Phone number required.' });

    try {
        const identifier = phone.trim();
        const normPhone = normalizePhone(identifier);
        const member = await dbGet('SELECT * FROM members WHERE phone = ? OR email = ?', [normPhone, identifier]);
        
        // Security: Don't reveal if user exists, but if they don't, just return success
        if (!member) return res.json({ message: 'If your account is registered, you will receive a reset code shortly.' });

        if (method === 'email' && !member.email) {
            return res.status(400).json({ error: 'No email address linked to this account. Please use SMS.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await dbRun('UPDATE members SET reset_otp = ?, reset_otp_expiry = ? WHERE id = ?', [otp, expiry, member.id]);
        
        if (method === 'email') {
            await sendEmail(member.email, 'LLUCG Password Reset', `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #3b82f6; text-align: center;">Password Reset Request</h2>
                    <p>Hello ${member.name},</p>
                    <p>Use the security code below to reset your portal PIN:</p>
                    <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #1e293b;">${otp}</span>
                    </div>
                    <p style="font-size: 13px; color: #64748b; text-align: center;">This code is valid for 15 minutes. If you did not request this, please ignore this email.</p>
                </div>
            `);
        } else {
            const msg = `[LLUCG] Your security reset code is: ${otp}. Valid for 15 minutes.`;
            await sendSMS([member.phone], msg, 'security_reset');
        }

        res.json({ message: 'If your account is registered, you will receive a reset code shortly.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/forgot-password/reset', [
    body('phone').trim().notEmpty(),
    body('otp').notEmpty().withMessage('OTP is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    validate
], async (req, res) => {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword) return res.status(400).json({ error: 'Phone, code, and new password are required.' });

    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passRegex.test(newPassword)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.' });
    }

    try {
        const normPhone = normalizePhone(phone);
        const member = await dbGet('SELECT * FROM members WHERE phone = ?', [normPhone]);
        if (!member || member.reset_otp !== otp.toString()) {
            return res.status(400).json({ error: 'Invalid reset code or phone number.' });
        }

        if (new Date() > new Date(member.reset_otp_expiry)) {
            return res.status(400).json({ error: 'Reset code has expired.' });
        }

        const hash = bcrypt.hashSync(newPassword, 10);
        await dbRun(
            'UPDATE members SET password_hash = ?, must_change_password = 0, reset_otp = NULL, reset_otp_expiry = NULL WHERE id = ?', 
            [hash, member.id]
        );
        
        logActivity('Password Reset', 'Member', member.id, `${member.name} reset their password via Forgot Password flow`, member.name);
        res.json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login/2fa/verify', async (req, res) => {
    const { memberId, token: otpToken } = req.body;
    if (!memberId || !otpToken) return res.status(400).json({ error: 'memberId and token required.' });

    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        if (!member || !member.totp_enabled) return res.status(400).json({ error: 'Invalid request.' });

        // Lockout check
        if (member.locked_until && new Date(member.locked_until) > new Date()) {
            return res.status(403).json({ error: 'Account is locked.' });
        }

        let isValid = false;
        if (member.totp_method === 'totp') {
            const v = await verify({ token: otpToken, secret: member.totp_secret });
            isValid = v.valid;
        } else {
            const [prefix, savedOtp, timestamp] = (member.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;
            if ((prefix === 'SMS' || prefix === 'EMAIL') && otpToken === savedOtp && age < 300) isValid = true;
        }

        if (!isValid) return res.status(410).json({ error: 'Invalid or expired code.' });

        let suspicious = false;
        if (member.last_ip && member.last_ip !== req.ip) {
            suspicious = true; // IP changed significantly
        }
        await dbRun('UPDATE members SET mfa_token = NULL, last_login = ?, last_ip = ? WHERE id = ?', [new Date().toISOString(), req.ip, member.id]);

        const token = jwt.sign({ id: member.id, name: member.name, phone: member.phone }, MEMBER_SECRET, { expiresIn: '24h' });
        
        // Record Session
        await dbRun('INSERT INTO member_sessions (memberId, token, ip, userAgent, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)', [
            member.id, token, req.ip, req.headers['user-agent'], new Date().toISOString(), new Date(Date.now() + 24 * 3600 * 1000).toISOString()
        ]);

        if (suspicious) {
            try {
                await sendSMS([member.phone], `[LLUCG Security] A new login was detected on your account from IP ${req.ip} via 2FA. If this wasn't you, reset your PIN immediately.`, 'security_alert');
                logActivity('Suspicious Login (2FA)', 'Member', member.id, `Login from new IP: ${req.ip} (Previous: ${member.last_ip})`, member.name);
            } catch (e) { console.error('Alert SMS failed:', e.message); }
        } else {
            logActivity('Member Login (2FA)', 'Member', member.id, `${member.name} logged into portal with 2FA`, member.name);
        }

        res.json({ token, id: member.id, name: member.name });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/change-pin', memberAuthRequired, async (req, res) => {
    const { currentPin, newPin, isMandatoryReset } = req.body;
    if (!newPin) return res.status(400).json({ error: 'New PIN/Password required.' });
    
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passRegex.test(newPin)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.' });
    }

    try {
        const member = await dbGet('SELECT password_hash, must_change_password FROM members WHERE id = ?', [req.member.id]);
        
        if (!currentPin) return res.status(400).json({ error: 'Current PIN is required.' });
        let ok = false;
        if (!member.password_hash) ok = (currentPin === '1234');
        else ok = bcrypt.compareSync(currentPin, member.password_hash);
        
        if (!ok) return res.status(401).json({ error: 'Incorrect current PIN.' });

        const newHash = bcrypt.hashSync(newPin, 10);
        await dbRun('UPDATE members SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, req.member.id]);
        logActivity('PIN Changed', 'Member', req.member.id, `${req.member.name} updated their security PIN/Password`, req.member.name);
        res.json({ message: 'Security updated successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/2fa/status', memberAuthRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT totp_enabled, totp_method FROM members WHERE id = ?', [req.member.id]);
        res.json({ enabled: !!member.totp_enabled, method: member.totp_method });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/setup', memberAuthRequired, async (req, res) => {
    try {
        const secret = await generateSecret();
        await dbRun('UPDATE members SET totp_secret = ? WHERE id = ?', [secret, req.member.id]);
        
        const uri = generateURI({ secret, label: req.member.name, issuer: 'LLUCG-Member' });
        const qrCode = await QRCode.toDataURL(uri);
        
        res.json({ secret, qrCode });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/request', memberAuthRequired, async (req, res) => {
    const { method } = req.body;
    const authMethod = method || 'sms';

    try {
        const member = await dbGet('SELECT phone, email FROM members WHERE id = ?', [req.member.id]);
        
        if (authMethod === 'sms' && !member.phone) return res.status(400).json({ error: 'No phone number linked.' });
        if (authMethod === 'email' && !member.email) return res.status(400).json({ error: 'No email address linked.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await dbRun('UPDATE members SET mfa_token = ? WHERE id = ?', [`${authMethod.toUpperCase()}:${otp}:${Date.now()}`, req.member.id]);
        
        if (authMethod === 'email') {
            await sendEmail(member.email, 'LLUCG Security Code', `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 500px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
                    <h2 style="color: #3b82f6; text-align: center;">Verification Code</h2>
                    <p>Use the code below to authorize your action:</p>
                    <div style="background: #f8fafc; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #1e293b;">${otp}</span>
                    </div>
                    <p style="font-size: 13px; color: #64748b; text-align: center;">This code expires in 5 minutes.</p>
                </div>
            `);
            res.json({ message: 'Code sent to your registered email.' });
        } else {
            await sendSMS([member.phone], `Your LLUCG security code is: ${otp}. Valid for 5 minutes.`);
            res.json({ message: 'Code sent to your registered phone number.' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/sms/request', memberAuthRequired, async (req, res) => {
    // Legacy support
    req.body.method = 'sms';
    // Duplicate logic for simplicity in this turn
    try {
        const member = await dbGet('SELECT phone FROM members WHERE id = ?', [req.member.id]);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await dbRun('UPDATE members SET mfa_token = ? WHERE id = ?', [`SMS:${otp}:${Date.now()}`, req.member.id]);
        await sendSMS([member.phone], `Your LLUCG security code is: ${otp}. Valid for 5 minutes.`);
        res.json({ message: 'Code sent to your registered phone number.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/transaction/request', memberAuthRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT phone FROM members WHERE id = ?', [req.member.id]);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Uses prefix TRANS to distinguish from login MFA
        await dbRun('UPDATE members SET mfa_token = ? WHERE id = ?', [`TRANS:${otp}:${Date.now()}`, req.member.id]);
        
        await sendSMS([member.phone], `[SECURITY] Use code ${otp} to authorize your transaction in the portal. Valid for 5 minutes.`);
        logActivity('Trans-MFA Requested', 'Security', req.member.id, `Transaction 2FA requested by ${req.member.name}`);
        res.json({ success: true, message: 'Authorization code sent.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/enable', memberAuthRequired, async (req, res) => {
    const { token, method } = req.body;
    if (!token || !method) return res.status(400).json({ error: 'Token and method required.' });

    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.member.id]);
        if (!member.totp_secret) return res.status(400).json({ error: '2FA not initialized.' });

        let isValid = false;
        if (method === 'totp') {
            const v = await verify({ token, secret: member.totp_secret });
            isValid = v.valid;
        } else if (method === 'sms') {
            const [prefix, savedOtp, timestamp] = (member.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;
            if (prefix === 'SMS' && token === savedOtp && age < 300) isValid = true;
        }

        if (!isValid) return res.status(400).json({ error: 'Invalid or expired code.' });

        await dbRun('UPDATE members SET totp_enabled = 1, totp_method = ? WHERE id = ?', [method, req.member.id]);
        logActivity('2FA Enabled', 'Member', req.member.id, `${req.member.name} enabled 2FA security (${method})`, req.member.name);
        res.json({ message: '2FA enabled successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/2fa/disable', memberAuthRequired, async (req, res) => {
    const { token } = req.body;
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.member.id]);
        
        let isValid = false;
        if (member.totp_method === 'totp') {
            const v = await verify({ token, secret: member.totp_secret });
            isValid = v.valid;
        } else {
            const [prefix, savedOtp, timestamp] = (member.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;
            if (prefix === 'SMS' && token === savedOtp && age < 600) isValid = true;
        }

        if (!isValid) return res.status(400).json({ error: 'Invalid code.' });

        await dbRun('UPDATE members SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [req.member.id]);
        logActivity('2FA Disabled', 'Member', req.member.id, `${req.member.name} disabled 2FA security`, req.member.name);
        res.json({ message: '2FA disabled.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/auth/2fa/status', memberAuthRequired, async (req, res) => {
    try {
        const m = await dbGet('SELECT totp_enabled, totp_method FROM members WHERE id = ?', [req.member.id]);
        res.json({ enabled: !!m?.totp_enabled, method: m?.totp_method || 'totp' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SESSION MANAGEMENT ---

router.get('/sessions', memberAuthRequired, async (req, res) => {
    try {
        const sessions = await dbAll(
            `SELECT id, ip, userAgent, createdAt, expiresAt, revoked 
             FROM member_sessions 
             WHERE memberId = ? AND revoked = 0 AND expiresAt > ? 
             ORDER BY createdAt DESC`,
            [req.member.id, new Date().toISOString()]
        );
        
        // Mark current session
        const currentToken = req.headers['authorization']?.slice(7) || req.query.token;
        const processed = sessions.map(s => {
            // Check if current session by looking for token (not ideal to select token, so we'll compare in memory if we have it)
            // Actually, for better listing, we'll just check if current session matches token if we want to.
            // But usually ID is enough if we know it.
            return {
                ...s,
                isCurrent: false // Default to false
            };
        });

        // We need a way to identify current session without selecting the token (security)
        // Let's select a hash of the token or just use the token temporarily to mark it
        const sessionsWithToken = await dbAll(
            `SELECT id, token FROM member_sessions WHERE memberId = ? AND revoked = 0`,
            [req.member.id]
        );
        
        const finalSessions = processed.map(s => {
            const tokenRow = sessionsWithToken.find(t => t.id === s.id);
            return {
                ...s,
                isCurrent: tokenRow ? tokenRow.token === currentToken : false
            };
        });

        res.json({ sessions: finalSessions });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sessions/others', memberAuthRequired, async (req, res) => {
    const currentToken = req.headers['authorization']?.slice(7) || req.query.token;
    try {
        await dbRun(
            'UPDATE member_sessions SET revoked = 1 WHERE memberId = ? AND token != ?',
            [req.member.id, currentToken]
        );
        logActivity('Sessions Revoked', 'Member', req.member.id, `Terminated all other sessions`, req.member.name);
        res.json({ message: 'All other sessions have been terminated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sessions/:id', memberAuthRequired, async (req, res) => {
    try {
        await dbRun(
            'UPDATE member_sessions SET revoked = 1 WHERE id = ? AND memberId = ?',
            [req.params.id, req.member.id]
        );
        logActivity('Session Terminated', 'Member', req.member.id, `Terminated specific session ID: ${req.params.id}`, req.member.name);
        res.json({ message: 'Session terminated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SECURITY AUDIT LOGS ---

router.get('/security-logs', memberAuthRequired, async (req, res) => {
    try {
        const logs = await dbAll(
            `SELECT id, action, details, timestamp 
             FROM activity_log 
             WHERE entity = 'Member' AND entity_id = ? 
             AND (action LIKE '%Login%' OR action LIKE '%PIN%' OR action LIKE '%Password%' OR action LIKE '%2FA%' OR action LIKE '%Session%')
             ORDER BY timestamp DESC LIMIT 20`,
            [String(req.member.id)]
        );
        res.json({ logs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
