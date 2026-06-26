const express = require('express');
const router  = express.Router();
const jwt = require('jsonwebtoken');
const { SECRET, MEMBER_SECRET } = require('../config');
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { authRequired, memberAuthRequired } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { encryptDM, decryptDM } = require('../utils/crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `COMM_${Date.now()}_${Math.random().toString(36).substr(2,5)}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// --- Unified Auth Middleware for COMM Hub ---
// --- Unified Auth Middleware for COMM Hub ---
async function commAuth(req, res, next) {
    try {
        let token = req.query.token;
        if (!token) {
            const header = req.headers['authorization'];
            if (header && header.startsWith('Bearer ')) token = header.slice(7);
        }
        
        if (!token) {
            console.error('[CommAuth] No token provided');
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        // Try Admin check
        try {
            const decoded = jwt.verify(token, SECRET);
            const admin = await dbGet(`
                SELECT a.id, a.username, a.role, s.revoked, s.expiresAt 
                FROM admin_users a 
                JOIN admin_sessions s ON a.id = s.adminId 
                WHERE s.token = ?
            `, [token]);
            
            if (admin && admin.revoked === 0 && new Date(admin.expiresAt) > new Date()) {
                req.admin = { id: admin.id, username: admin.username, role: admin.role || 'admin' };
                console.log(`[CommAuth] Admin ${admin.username} verified.`);
                return next();
            } else if (admin) {
                console.warn(`[CommAuth] Admin session revoked or expired for ${admin.username}`);
            }
        } catch (e) {
            // Not an admin token, continue
        }

        // Try Member check
        try {
            const decodedMember = jwt.verify(token, MEMBER_SECRET);
            const member = await dbGet(`
                SELECT m.id, m.name, m.phone, s.revoked, s.expiresAt 
                FROM members m 
                JOIN member_sessions s ON m.id = s.memberId 
                WHERE s.token = ?
            `, [token]);
            
            if (member && member.revoked === 0 && new Date(member.expiresAt) > new Date()) {
                req.member = { id: member.id, name: member.name, phone: member.phone };
                console.log(`[CommAuth] Member ${member.name} verified.`);
                return next();
            } else if (member) {
                console.warn(`[CommAuth] Member session revoked or expired for ${member.name}`);
            }
        } catch (e) {
            // Not a member token
        }

        console.error('[CommAuth] Auth failed for token');
        return res.status(401).json({ error: 'Unauthorized: Session invalid or expired' });
    } catch (err) {
        console.error('[CommAuth] Crash in middleware:', err.message);
        return res.status(500).json({ error: 'Internal server error in auth.' });
    }
}

// --- Auth-Protected File Proxy (lightweight JWT-only, placed BEFORE commAuth to avoid DB lock) ---
router.get('/files/:filename', (req, res) => {
    try {
        let token = req.query.token;
        if (!token) {
            const header = req.headers['authorization'];
            if (header && header.startsWith('Bearer ')) token = header.slice(7);
        }
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        let authorized = false;
        try { jwt.verify(token, SECRET); authorized = true; } catch (_) {}
        if (!authorized) {
            try { jwt.verify(token, MEMBER_SECRET); authorized = true; } catch (_) {}
        }
        if (!authorized) return res.status(401).json({ error: 'Unauthorized' });

        const { filename } = req.params;
        const filepath = path.join(__dirname, '..', 'uploads', filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found.' });
        }

        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.pdf':  'application/pdf',
            '.jpg':  'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png':  'image/png',
            '.webp': 'image/webp',
            '.gif':  'image/gif',
            '.doc':  'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const stat = fs.statSync(filepath);

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Content-Disposition': `inline; filename="${filename}"`,
        });

        fs.createReadStream(filepath).pipe(res);
    } catch (err) {
        console.error(`[CommFiles] Error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
    }
});

router.use(commAuth);

// --- Member Support Threads ---

// List threads
router.get('/threads', async (req, res) => {
    try {
        let rows;
        if (req.member) {
            rows = await dbAll('SELECT * FROM comm_threads WHERE memberId = ? ORDER BY updated_at DESC', [req.member.id]);
        } else if (req.admin) {
            const role = req.admin.role;
            let categoryFilter = '';
            
            if (['superadmin', 'admin'].includes(role)) {
                categoryFilter = ''; 
            } else if (['finance_admin', 'treasurer'].includes(role)) {
                categoryFilter = "WHERE t.category IN ('finance', 'general')";
            } else if (role === 'secretary') {
                categoryFilter = "WHERE t.category IN ('secretary', 'general')";
            } else if (role === 'ict_admin') {
                categoryFilter = "WHERE t.category IN ('technical', 'general')";
            } else {
                categoryFilter = "WHERE 1=0";
            }

            rows = await dbAll(`
                SELECT t.*, m.name as memberName 
                FROM comm_threads t 
                JOIN members m ON t.memberId = m.id 
                ${categoryFilter}
                ORDER BY t.status DESC, t.updated_at DESC
            `);
        }
        res.json({ threads: rows || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create thread (Member only)
router.post('/threads', async (req, res) => {
    if (!req.member) return res.status(403).json({ error: 'Members only.' });
    
    const { subject, initialMessage, category } = req.body;
    if (!subject || !initialMessage) return res.status(400).json({ error: 'Subject and initial message required.' });

    try {
        const now = new Date().toISOString();
        const cat = category || 'general';
        const thread = await dbRun(
            'INSERT INTO comm_threads (memberId, subject, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [req.member.id, subject, cat, 'open', now, now]
        );
        const threadId = thread.lastID;

        const { iv: eIv, encryptedData: eData, authTag: eTag } = encryptDM(initialMessage);
        await dbRun(
            'INSERT INTO comm_messages (threadId, senderType, senderId, senderName, content, attachmentUrl, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [threadId, 'member', req.member.id, req.member.name, JSON.stringify({ iv: eIv, d: eData, t: eTag }), null, now]
        );

        // Notify appropriate admin roles
        try {
            const getRolesForCategory = (c) => {
                const term = (c || '').toLowerCase();
                if (term.includes('finance')) return ['finance_admin', 'treasurer', 'superadmin'];
                if (term.includes('secretary')) return ['secretary', 'superadmin'];
                if (term.includes('technical') || term.includes('ict')) return ['ict_admin', 'superadmin'];
                return ['superadmin', 'admin', 'staff'];
            };

            const targetRoles = getRolesForCategory(cat);
            const placeHolders = targetRoles.map(() => '?').join(',');
            const adminsToNotify = await dbAll(
                `SELECT id FROM admin_users WHERE role IN (${placeHolders})`,
                targetRoles
            );

            const { createNotification } = require('../utils/notifications');
            for (const admin of adminsToNotify) {
                await createNotification(
                    admin.id, 'admin',
                    `New Ticket: ${cat.toUpperCase()} 🎫`,
                    `Member ${req.member.name} raised ticket: "${subject}"`,
                    '/communications', 'info'
                );
            }
        } catch (notifErr) {
            console.error('Failed to notify admins for ticket:', notifErr.message);
        }

        res.json({ message: 'Ticket created.', threadId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get messages
router.get('/threads/:id/messages', async (req, res) => {
    try {
        // Enforce access control
        if (req.member) {
            const thread = await dbGet('SELECT memberId FROM comm_threads WHERE id = ?', [req.params.id]);
            if (!thread || thread.memberId !== req.member.id) return res.status(403).json({ error: 'Access denied.' });
        }
        const messages = await dbAll('SELECT * FROM comm_messages WHERE threadId = ? ORDER BY timestamp ASC', [req.params.id]);
        const decrypted = messages.map(m => {
            try {
                const parsed = JSON.parse(m.content);
                if (parsed.iv && parsed.d && parsed.t) {
                    return { ...m, content: decryptDM({ iv: parsed.iv, encryptedData: parsed.d, authTag: parsed.t }) };
                }
                return m; // Legacy unencrypted message
            } catch { return m; } // Plain text fallback for old messages
        });
        res.json({ messages: decrypted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Post message
router.post('/threads/:id/messages', upload.single('attachment'), async (req, res) => {
    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: 'Message content or attachment required.' });

    try {
        // Enforce access control and derive sender info directly from the token
        let senderType, senderId, senderName;
        if (req.member) {
            const thread = await dbGet('SELECT * FROM comm_threads WHERE id = ?', [req.params.id]);
            if (!thread || thread.memberId !== req.member.id) return res.status(403).json({ error: 'Access denied.' });
            if (thread.status === 'closed') return res.status(400).json({ error: 'Thread is closed.' });
            senderType = 'member';
            senderId = req.member.id;
            senderName = req.member.name;
        } else if (req.admin) {
            senderType = 'admin';
            senderId = req.admin.id || 0;
            senderName = req.admin.username || 'Admin';
        }

        const now = new Date().toISOString();
        const attachmentUrl = req.file ? `/api/comm/files/${req.file.filename}` : null;
        
        const { iv: eIv, encryptedData: eData, authTag: eTag } = encryptDM(content || '');
        await dbRun(
            'INSERT INTO comm_messages (threadId, senderType, senderId, senderName, content, attachmentUrl, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, senderType, senderId, senderName, JSON.stringify({ iv: eIv, d: eData, t: eTag }), attachmentUrl, now]
        );
        await dbRun('UPDATE comm_threads SET updated_at = ? WHERE id = ?', [now, req.params.id]);
        res.json({ message: 'Message sent.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Close thread
router.post('/threads/:id/close', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    try {
        await dbRun("UPDATE comm_threads SET status = 'closed', updated_at = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
        res.json({ message: 'Ticket closed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Internal Admin Chat ---

router.get('/admin-chat', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    try {
        const messages = await dbAll('SELECT * FROM admin_chat ORDER BY timestamp DESC LIMIT 50');
        const decrypted = messages.reverse().map(m => {
            try {
                const parsed = JSON.parse(m.content);
                if (parsed.iv && parsed.d && parsed.t) {
                    return { ...m, content: decryptDM({ iv: parsed.iv, encryptedData: parsed.d, authTag: parsed.t }) };
                }
                return m;
            } catch { return m; }
        });
        res.json({ messages: decrypted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin-chat', upload.single('attachment'), async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: 'Message content or attachment required.' });

    try {
        const attachmentUrl = req.file ? `/api/comm/files/${req.file.filename}` : null;
        const { iv: eIv, encryptedData: eData, authTag: eTag } = encryptDM(content || '');
        await dbRun(
            'INSERT INTO admin_chat (adminId, senderName, senderRole, content, attachmentUrl, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [req.admin.id, req.admin.username, req.admin.role, JSON.stringify({ iv: eIv, d: eData, t: eTag }), attachmentUrl, new Date().toISOString()]
        );
        res.json({ message: 'Sent.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Group Channels (Slack-Style) ---

// Get all channels
router.get('/channels', async (req, res) => {
    try {
        let channels = [];
        if (req.admin) {
             // Admin sees all channels 
             channels = await dbAll('SELECT * FROM comm_channels ORDER BY createdAt DESC');
        } else if (req.member) {
             // Members see only channels they belong to
             channels = await dbAll(`
                SELECT c.* 
                FROM comm_channels c
                JOIN comm_channel_members m ON c.id = m.channelId
                WHERE m.userId = ? AND m.userType = 'member'
                ORDER BY c.createdAt DESC
             `, [req.member.id]);
        }
        res.json({ channels });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create channel (Admin only)
router.post('/channels', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Channel name required.' });

    try {
        const now = new Date().toISOString();
        const r = await dbRun(
            'INSERT INTO comm_channels (name, description, createdBy, createdAt) VALUES (?, ?, ?, ?)',
            [name, description || '', req.admin.id, now]
        );
        const channelId = r.lastID;

        // Auto-add the creator
        await dbRun(
            'INSERT INTO comm_channel_members (channelId, userId, userType, addedAt) VALUES (?, ?, ?, ?)',
            [channelId, req.admin.id, 'admin', now]
        );

        logActivity('Channel Created', 'Communication', channelId, `Created channel #${name} by ${req.admin.username}`);
        res.json({ message: 'Channel created successfully.', channelId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add members to channel (Admin only)
router.post('/channels/:id/members', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    const { membersToAdd } = req.body; // Array of objects { id, type } -> { id: 1, type: 'member' }
    if (!membersToAdd || !Array.isArray(membersToAdd)) return res.status(400).json({ error: 'Valid members array required.' });

    try {
        const channelId = req.params.id;
        const now = new Date().toISOString();
        const promises = membersToAdd.map(m => 
            dbRun(
                'INSERT OR IGNORE INTO comm_channel_members (channelId, userId, userType, addedAt) VALUES (?, ?, ?, ?)',
                [channelId, m.id, m.type, now]
            )
        );
        await Promise.all(promises);
        res.json({ message: 'Members added successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get participants
router.get('/channels/:id/members', async (req, res) => {
    try {
        const channelId = req.params.id;
        // Basic check
        if (req.member) {
            const isMember = await dbGet('SELECT * FROM comm_channel_members WHERE channelId = ? AND userId = ? AND userType = "member"', [channelId, req.member.id]);
            if (!isMember) return res.status(403).json({ error: 'Access denied.' });
        }
        const users = await dbAll('SELECT userId, userType FROM comm_channel_members WHERE channelId = ?', [channelId]);
        res.json({ members: users });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get messages for a channel
router.get('/channels/:id/messages', async (req, res) => {
    try {
        const channelId = req.params.id;
        // Verify access if member
        if (req.member) {
            const isMember = await dbGet('SELECT * FROM comm_channel_members WHERE channelId = ? AND userId = ? AND userType = "member"', [channelId, req.member.id]);
            if (!isMember) return res.status(403).json({ error: 'Access denied.' });
        }
        
        const messages = await dbAll('SELECT * FROM comm_channel_messages WHERE channelId = ? ORDER BY timestamp ASC', [channelId]);
        const decrypted = messages.map(m => {
            try {
                const parsed = JSON.parse(m.content);
                if (parsed.iv && parsed.d && parsed.t) {
                    return { ...m, content: decryptDM({ iv: parsed.iv, encryptedData: parsed.d, authTag: parsed.t }) };
                }
                return m;
            } catch { return m; }
        });
        res.json({ messages: decrypted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send message to channel
router.post('/channels/:id/messages', upload.single('attachment'), async (req, res) => {
    const { content } = req.body;
    if (!content && !req.file) return res.status(400).json({ error: 'Message content or attachment required.' });
    
    try {
        const channelId = req.params.id;
        let senderType, senderId, senderName;
        
        // Verify access & map sender
        if (req.member) {
            const isMember = await dbGet('SELECT * FROM comm_channel_members WHERE channelId = ? AND userId = ? AND userType = "member"', [channelId, req.member.id]);
            if (!isMember) return res.status(403).json({ error: 'Access denied.' });
            senderType = 'member';
            senderId = req.member.id;
            senderName = req.member.name;
        } else if (req.admin) {
            senderType = 'admin';
            senderId = req.admin.id || 0;
            senderName = req.admin.username || 'Admin';
        }

        const now = new Date().toISOString();
        const attachmentUrl = req.file ? `/api/comm/files/${req.file.filename}` : null;
        
        const { iv: eIv, encryptedData: eData, authTag: eTag } = encryptDM(content || '');
        await dbRun(
            'INSERT INTO comm_channel_messages (channelId, senderId, senderType, senderName, content, attachmentUrl, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [channelId, senderId, senderType, senderName, JSON.stringify({ iv: eIv, d: eData, t: eTag }), attachmentUrl, now]
        );
        res.json({ message: 'Message sent.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete channel
router.delete('/channels/:id', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    try {
        const channelId = req.params.id;
        const channel = await dbGet('SELECT * FROM comm_channels WHERE id = ?', [channelId]);
        
        if (!channel) return res.status(404).json({ error: 'Channel not found.' });

        // User must be creator OR superadmin OR ict_admin
        if (channel.createdBy !== req.admin.id && !['superadmin', 'ict_admin'].includes(req.admin.role)) {
            return res.status(403).json({ error: 'You do not have permission to delete this channel.' });
        }

        // Manually cascade deletes since SQLite FK PRAGMA isn't explicitly on
        await dbRun('DELETE FROM comm_channel_messages WHERE channelId = ?', [channelId]);
        await dbRun('DELETE FROM comm_channel_members WHERE channelId = ?', [channelId]);
        await dbRun('DELETE FROM comm_channels WHERE id = ?', [channelId]);
        
        logActivity('Channel Deleted', 'Communication', channelId, `Deleted channel #${channel.name} by ${req.admin.username}`);
        res.json({ message: 'Channel deleted successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ADMIN DIRECT MESSAGING ---

// Directory of other admins
router.get('/dms/directory', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    try {
        const users = await dbAll('SELECT id, username, role FROM admin_users WHERE id != ? ORDER BY username ASC', [req.admin.id]);
        res.json({ users });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get direct messages with a specific partner
router.get('/dms/:partnerId', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    try {
        const adminId = req.admin.id;
        const partnerId = req.params.partnerId;
        
        const messages = await dbAll(`
            SELECT * FROM admin_direct_messages 
            WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
            ORDER BY timestamp ASC
        `, [adminId, partnerId, partnerId, adminId]);
        
        // Decrypt dynamically for the authenticated caller
        const decryptedMessages = messages.map(m => ({
            id: m.id,
            senderId: m.senderId,
            receiverId: m.receiverId,
            timestamp: m.timestamp,
            content: decryptDM({ iv: m.iv, encryptedData: m.encryptedData, authTag: m.authTag })
        }));
        
        res.json({ messages: decryptedMessages });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send a direct encrypted message
router.post('/dms/:partnerId', async (req, res) => {
    if (!req.admin) return res.status(403).json({ error: 'Admin only.' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required.' });
    
    try {
        const adminId = req.admin.id;
        const partnerId = req.params.partnerId;
        const now = new Date().toISOString();
        
        // Encrypt the payload before it ever hits the database engine
        const { iv, encryptedData, authTag } = encryptDM(content.trim());
        
        await dbRun(
            'INSERT INTO admin_direct_messages (senderId, receiverId, encryptedData, iv, authTag, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [adminId, partnerId, encryptedData, iv, authTag, now]
        );
        res.json({ message: 'Encrypted DM sent.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
