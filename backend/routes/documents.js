const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { SECRET, MEMBER_SECRET } = require('../config');
const { dbAll, dbRun, dbGet } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { authRequired, sharedAdminRequired, sharedAuth } = require('../middleware/auth');

// --- Multer Setup for Vault ---
const vaultStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/vault/');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `VAULT_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
        cb(null, name);
    }
});
const uploadVault = multer({ storage: vaultStorage });

// Redundant local dualAuthRequired removed in favor of sharedAuth from middleware

const serveSecureFile = (filepath, filename, res, isDownload = false) => {
    try {
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found.' });
        }

        const ext = path.extname(filepath).toLowerCase();
        const mimeTypes = {
            '.pdf':  'application/pdf',
            '.jpg':  'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png':  'image/png',
            '.webp': 'image/webp',
            '.gif':  'image/gif',
            '.doc':  'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const stat = fs.statSync(filepath);

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Content-Disposition': isDownload ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`,
        });

        fs.createReadStream(filepath).pipe(res);
    } catch (err) {
        console.error(`[SecureFile] Error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Document Vault ---

router.get('/vault', sharedAuth, async (req, res) => {
    try {
        const docs = await dbAll('SELECT * FROM org_documents ORDER BY uploadDate DESC');
        res.json({ documents: docs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vault', authRequired, sharedAdminRequired, uploadVault.single('file'), async (req, res) => {
    const { title, category, description } = req.body;
    const filename = req.file?.filename;
    
    if (!title || !filename) return res.status(400).json({ error: 'Title and file are required.' });

    try {
        const uploadedBy = req.admin.username;
        const uploadDate = new Date().toISOString();
        
        const r = await dbRun(
            'INSERT INTO org_documents (title, category, filename, uploadedBy, uploadDate, description) VALUES (?, ?, ?, ?, ?, ?)',
            [title, category || 'Other', filename, uploadedBy, uploadDate, description || '']
        );
        
        logActivity('Vault Upload', 'Admin', req.admin.id, `Uploaded: ${title} (${category})`, uploadedBy);
        res.json({ message: 'Document uploaded successfully.', id: r.lastID, filename });
    } catch (err) {
        console.error('Vault Upload DB Error:', err);
        res.status(500).json({ error: `Database failure: ${err.message}` });
    }
});

router.get('/vault/:filename', sharedAuth, (req, res) => {
    if (req.params.filename.includes('..')) return res.status(400).send('Traversal blocked');
    const fp = path.join(__dirname, '..', 'uploads', 'vault', req.params.filename);
    serveSecureFile(fp, req.params.filename, res, req.query.download === 'true');
});

router.delete('/vault/:id', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const doc = await dbGet('SELECT filename, title FROM org_documents WHERE id = ?', [req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        await dbRun('DELETE FROM org_documents WHERE id = ?', [req.params.id]);
        
        const fp = path.join(__dirname, '..', 'uploads', 'vault', doc.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);

        logActivity('Vault Delete', 'Document', req.params.id, `Deleted: ${doc.title} by ${req.admin.username}`, req.admin.username);
        res.json({ message: 'Document deleted from vault.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Aggregated Admin Activity / My Uploads ---

router.get('/my-uploads', authRequired, async (req, res) => {
    try {
        const user = req.admin.username;
        
        // Aggregate documents from org_documents, member_documents, and expenses
        const [vault, kyc, expenses] = await Promise.all([
            dbAll('SELECT id, title as name, "Vault Document" as type, description as details, uploadDate as date, filename FROM org_documents WHERE uploadedBy = ?', [user]),
            dbAll('SELECT id, (SELECT name FROM members WHERE id = member_documents.memberId) as name, "Member KYC" as type, documentType as details, uploadDate as date, filename FROM member_documents WHERE uploadedBy = ?', [user]),
            dbAll('SELECT id, description as name, "Expense Receipt" as type, category as details, expenseDate as date, receiptFilename as filename FROM expenses WHERE recordedBy = ? AND receiptFilename IS NOT NULL', [user])
        ]);

        const all = [...vault, ...kyc, ...expenses].sort((a,b) => new Date(b.date) - new Date(a.date));
        res.json({ uploads: all });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- KYC Documents ---

router.get('/kyc/:filename', sharedAuth, (req, res) => {
    if (req.params.filename.includes('..')) return res.status(400).send('Traversal blocked');
    const fp = path.join(__dirname, '..', 'uploads', req.params.filename);
    serveSecureFile(fp, req.params.filename, res, !!req.query.download);
});

module.exports = router;
