const jwt = require('jsonwebtoken');
const { SECRET, MEMBER_SECRET } = require('../config');
const { dbGet } = require('../utils/helpers');

async function authRequired(req, res, next) {
    let token = req.query.token;
    if (!token) {
        const header = req.headers['authorization'];
        if (header && header.startsWith('Bearer ')) {
            token = header.slice(7);
        }
    }
    
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    
    try {
        // Verify token signature and expiration first
        const decoded = jwt.verify(token, SECRET);
        
        // Fetch FRESH data from DB to ensure roles/status are live
        const admin = await dbGet(`
            SELECT a.id, a.username, a.role, s.revoked 
            FROM admin_users a 
            JOIN admin_sessions s ON a.id = s.adminId 
            WHERE s.token = ?
        `, [token]);

        if (!admin || admin.revoked === 1) {
            return res.status(401).json({ error: 'Unauthorized: Session has been revoked or expired.' });
        }

        // Use the FRESH role from the database, not just the one in the JWT
        req.admin = { 
            id: admin.id, 
            username: admin.username, 
            role: admin.role || 'admin' 
        };
        next();
    } catch {
        res.status(401).json({ error: 'Unauthorized: Token invalid or expired' });
    }
}

async function memberAuthRequired(req, res, next) {
    let token = req.query.token;
    if (!token) {
        const header = req.headers['authorization'];
        if (header && header.startsWith('Bearer ')) {
            token = header.slice(7);
        }
    }
    
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    
    try {
        jwt.verify(token, MEMBER_SECRET);

        // Fetch FRESH member info
        const member = await dbGet(`
            SELECT m.id, m.name, m.phone, s.revoked 
            FROM members m 
            JOIN member_sessions s ON m.id = s.memberId 
            WHERE s.token = ?
        `, [token]);

        if (!member || member.revoked === 1) {
            return res.status(401).json({ error: 'Unauthorized: Session has been revoked or expired.' });
        }

        req.member = { 
            id: member.id, 
            name: member.name, 
            phone: member.phone 
        };
        next();
    } catch {
        res.status(401).json({ error: 'Unauthorized: Token invalid or expired' });
    }
}

function superadminRequired(req, res, next) {
    if (!req.admin || req.admin.role !== 'superadmin') 
        return res.status(403).json({ error: 'Access denied: Superadmin privileges required.' });
    next();
}

function ictRequired(req, res, next) {
    if (!req.admin || !['superadmin', 'ict_admin'].includes(req.admin.role)) 
        return res.status(403).json({ error: 'Access denied: ICT privileges required.' });
    next();
}

function financeRequired(req, res, next) {
    if (!req.admin || !['superadmin', 'finance_admin', 'treasurer'].includes(req.admin.role)) 
        return res.status(403).json({ error: 'Access denied: Finance privileges required.' });
    next();
}

function secretaryRequired(req, res, next) {
    if (!req.admin || !['superadmin', 'admin', 'secretary'].includes(req.admin.role)) 
        return res.status(403).json({ error: 'Access denied: Secretariat privileges required.' });
    next();
}

function sharedAdminRequired(req, res, next) {
    if (!req.admin) return res.status(403).json({ error: 'Access denied: Admin login required.' });
    next();
}

// ictRequired already defined above — no duplicate needed

async function sharedAuth(req, res, next) {
    let token = req.query.token;
    if (!token) {
        const header = req.headers['authorization'];
        if (header && header.startsWith('Bearer ')) token = header.slice(7);
        else if (header) token = header.split(' ')[1];
    }
    
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    
    // 1. Try Admin Auth
    try {
        const decoded = jwt.verify(token, SECRET);
        const admin = await dbGet(`
            SELECT a.id, a.username, a.role 
            FROM admin_users a 
            JOIN admin_sessions s ON a.id = s.adminId 
            WHERE s.token = ? AND s.revoked = 0
        `, [token]);
        
        if (admin) {
            req.admin = { id: admin.id, username: admin.username, role: admin.role };
            return next();
        }
    } catch (e) {
        // Fall through to Member check
    }

    // 2. Try Member Auth
    try {
        jwt.verify(token, MEMBER_SECRET);
        const member = await dbGet(`
            SELECT m.id, m.name, m.phone 
            FROM members m 
            JOIN member_sessions s ON m.id = s.memberId 
            WHERE s.token = ? AND s.revoked = 0
        `, [token]);
        
        if (member) {
            req.member = { id: member.id, name: member.name, phone: member.phone };
            return next();
        }
    } catch (e) {
        // Both failed
    }

    res.status(401).json({ error: 'Unauthorized: Token invalid, expired, or session revoked.' });
}


async function highValueLock(req, res, next) {
    const amount = Number(req.body.amount || req.query.amount || 0);
    const HIGH_VALUE_THRESHOLD = 50000;
    const isLoanApp = req.path.includes('/applications') && req.method === 'POST';

    // Only apply to members for now
    if (!req.member) return next();

    if (amount >= HIGH_VALUE_THRESHOLD || isLoanApp) {
        const mfaCode = req.headers['x-mfa-code'] || req.body.mfaCode;

        if (!mfaCode) {
            // AUTO-GENERATE CODE ON CHALLENGE
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const { dbRun, sendSMS } = require('../utils/helpers'); // Lazy load to avoid circular deps
            
            await dbRun('UPDATE members SET mfa_token = ? WHERE id = ?', [`TRANS:${otp}:${Date.now()}`, req.member.id]);
            
            try {
                await sendSMS([req.member.phone], `[SECURITY] Use code ${otp} to authorize your loan application. Valid for 15 minutes.`);
            } catch (e) {
                console.error('HighValueLock SMS failed:', e.message);
            }

            return res.status(430).json({ 
                error: 'MFA_REQUIRED', 
                message: 'This is a high-value transaction. A verification code has been sent to your phone.',
                phoneMasked: req.member.phone.slice(0, 4) + '●●●●' + req.member.phone.slice(-3)
            });
        }

        // Verify the code
        try {
            const member = await dbGet('SELECT mfa_token FROM members WHERE id = ?', [req.member.id]);
            const [prefix, savedOtp, timestamp] = (member.mfa_token || '').split(':');
            const age = (Date.now() - parseInt(timestamp)) / 1000;

            if (prefix === 'TRANS' && mfaCode === savedOtp && age < 300) {
                // Valid! Clear the token so it can't be reused
                await dbGet('UPDATE members SET mfa_token = NULL WHERE id = ?', [req.member.id]);
                return next();
            } else {
                return res.status(430).json({ error: 'INVALID_MFA', message: 'The verification code is invalid or has expired.' });
            }
        } catch (e) {
            return res.status(500).json({ error: 'Internal security check failed.' });
        }
    }
    next();
}

module.exports = {
    authRequired,
    memberAuthRequired,
    superadminRequired,
    financeRequired,
    secretaryRequired,
    sharedAdminRequired,
    ictRequired,
    sharedAuth,
    highValueLock
};
