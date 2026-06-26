const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { authRequired, memberAuthRequired, sharedAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { createNotification } = require('../utils/notifications');
const { encryptDM, decryptDM } = require('../utils/crypto');
const multer = require('multer');
const path = require('path');
// System admin ID for ticket notifications (set via env var or default to 1)
const SYSTEM_ADMIN_ID = parseInt(process.env.SYSTEM_ADMIN_ID || '1', 10);

const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `SUPPORT_${Date.now()}_${Math.random().toString(36).substr(2,5)}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// --- Secure File Proxy ---
router.get('/files/:filename', sharedAuth, (req, res) => {
    const { filename } = req.params;
    const filepath = path.join(__dirname, '..', 'uploads', filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found.' });
    
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Content-Disposition': `inline; filename="${filename}"` });
    fs.createReadStream(filepath).pipe(res);
});

// --- Member Routes ---

router.post('/member/tickets', memberAuthRequired, async (req, res) => {
    const { subject, description, category, priority } = req.body;
    if (!subject || !description) return res.status(400).json({ error: 'Subject and description required.' });

    try {
        const r = await dbRun(
            'INSERT INTO support_tickets (memberId, subject, description, category, priority) VALUES (?, ?, ?, ?, ?)',
            [req.member.id, subject, description, category || 'General', priority || 'normal']
        );
        logActivity('Ticket Created', 'Support', r.lastID, `Subject: ${subject}`, req.member.name);
        // Notify system administrator about the new ticket
        await createNotification(
            SYSTEM_ADMIN_ID, 'admin',
            'New Support Ticket',
            `Member ${req.member.name} opened a ticket: "${subject}"`,
            '/admin/portal/support', 'info'
        );
        res.json({ id: r.lastID, message: 'Ticket raised successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/member/tickets', memberAuthRequired, async (req, res) => {
    try {
        const tickets = await dbAll('SELECT * FROM support_tickets WHERE memberId = ? ORDER BY timestamp DESC', [req.member.id]);
        res.json({ tickets });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Admin Routes ---

router.get('/admin/tickets', authRequired, async (req, res) => {
    try {
        const tickets = await dbAll(`
            SELECT t.*, m.name as memberName, m.membershipNumber 
            FROM support_tickets t 
            JOIN members m ON t.memberId = m.id 
            ORDER BY t.status DESC, t.timestamp DESC
        `);
        res.json({ tickets });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/tickets/:id/status', authRequired, async (req, res) => {
    const { status } = req.body;
    try {
        await dbRun('UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
        const ticket = await dbGet('SELECT memberId, subject FROM support_tickets WHERE id = ?', [req.params.id]);
        
        // Notify system administrator about the status change rather than the member
        await createNotification(
            SYSTEM_ADMIN_ID, 'admin',
            'Support Ticket Status Update',
            `Ticket "${ticket.subject}" (ID: ${req.params.id}) status changed to ${status}.`,
            '/admin/portal/support', status === 'closed' ? 'success' : 'info'
        );

        res.json({ message: `Ticket ${status}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Shared Reply Routes ---

router.get('/tickets/:id/replies', sharedAuth, async (req, res) => {
    try {
        const replies = await dbAll('SELECT * FROM support_replies WHERE ticketId = ? ORDER BY timestamp ASC', [req.params.id]);
        const decrypted = replies.map(r => {
            try {
                const parsed = JSON.parse(r.message);
                if (parsed.iv && parsed.encryptedData) {
                    return { ...r, message: decryptDM(parsed) };
                }
                return r;
            } catch { return r; }
        });
        res.json({ replies: decrypted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/tickets/:id/replies', sharedAuth, upload.single('attachment'), async (req, res) => {
    const { message } = req.body;
    if (!message && !req.file) return res.status(400).json({ error: 'Message or attachment required.' });

    try {
        const ticket = await dbGet('SELECT * FROM support_tickets WHERE id = ?', [req.params.id]);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

        if (req.member && ticket.memberId !== req.member.id) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const authorId = req.admin ? req.admin.id : req.member.id;
        const authorType = req.admin ? 'admin' : 'member';
        const authorName = req.admin ? req.admin.username : req.member.name;
        const attachmentUrl = req.file ? `/api/support/files/${req.file.filename}` : null;

        // Encrypt the message content
        const encrypted = encryptDM(message || '');
        const encryptedMsg = JSON.stringify(encrypted);

        await dbRun(
            'INSERT INTO support_replies (ticketId, authorId, authorType, authorName, message, attachmentUrl) VALUES (?, ?, ?, ?, ?, ?)',
            [req.params.id, authorId, authorType, authorName, encryptedMsg, attachmentUrl]
        );
        
        await dbRun('UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);

        // Notify the other party
        // When admin replies, notify system administrator instead of member
        if (authorType === 'admin') {
            await createNotification(
                SYSTEM_ADMIN_ID, 'admin',
                'New Support Reply 💬',
                `Admin replied to ticket "${ticket.subject}" (ID: ${req.params.id})`,
                '/admin/portal/support', 'info'
            );
        }

        res.json({ message: 'Reply added.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
