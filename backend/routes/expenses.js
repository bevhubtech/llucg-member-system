const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { dbAll, dbGet, dbRun, getSystemSettings, getSystemLiquidity } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { drawReportHeader, drawPageFooter } = require('../utils/pdf');
const { authRequired, financeRequired, sharedAdminRequired } = require('../middleware/auth');

// --- Multer Setup for Receipts ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `expense_${Date.now()}${ext}`;
        cb(null, name);
    }
});
const upload = multer({ storage });

// --- Routes ---

// List all expenses
router.get('/', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM expenses ORDER BY expenseDate DESC');
        res.json({ expenses: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Record new expense
router.post('/', authRequired, financeRequired, upload.single('receipt'), async (req, res) => {
    const { amount, category, description, expenseDate, recipient, fundingSource } = req.body;
    const receiptFilename = req.file ? req.file.filename : null;

    if (!amount || !category || !expenseDate) {
        return res.status(400).json({ error: 'Amount, category, and date are required.' });
    }

    try {
        // Strict Liquidity Check
        const fund = fundingSource || 'Institutional Reserves';
        const liquidity = await getSystemLiquidity(fund);
        if (parseFloat(amount) > liquidity) {
            return res.status(400).json({ error: `Insufficient funds in ${fund}. Available: KES ${liquidity.toLocaleString()}` });
        }

        const timestamp = new Date().toISOString();
        const username = req.admin.username;

        const r = await dbRun(
            'INSERT INTO expenses (amount, category, description, recipient, expenseDate, timestamp, createdBy, recordedBy, receiptFilename, status, fundingSource) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [amount, category, description || '', recipient || '', expenseDate, timestamp, username, username, receiptFilename, 'pending', fundingSource || 'Institutional Reserves']
        );
        
        logActivity('Expense Recorded', 'Expense', r.lastID, `${category}: KES ${amount} by ${username}`);
        res.json({ id: r.lastID, message: 'Expense recorded successfully.' });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// Approve expense
router.put('/:id/approve', authRequired, financeRequired, async (req, res) => {
    try {
        const expense = await dbGet('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        const adminId = req.admin.id;
        const adminName = req.admin.username;

        if (!expense.approver1_id) {
            await dbRun('UPDATE expenses SET approver1_id = ?, approver1_name = ? WHERE id = ?', [adminId, adminName, req.params.id]);
        } else if (!expense.approver2_id && expense.approver1_id !== adminId) {
            await dbRun('UPDATE expenses SET approver2_id = ?, approver2_name = ? WHERE id = ?', [adminId, adminName, req.params.id]);
        } else if (!expense.approver3_id && expense.approver1_id !== adminId && expense.approver2_id !== adminId) {
            await dbRun('UPDATE expenses SET approver3_id = ?, approver3_name = ?, status = "approved" WHERE id = ?', [adminId, adminName, req.params.id]);
            
            // Final Approval: Add to global transactions log (only on 3rd signature)
            const timestamp = new Date().toISOString();
            await dbRun(
                `INSERT INTO transactions (type, amount, description, performed_by, timestamp, fund) VALUES ('debit', ?, ?, ?, ?, ?)`,
                [expense.amount, `Expense Finalized: ${expense.category} - ${expense.description}`, adminName, timestamp, expense.fundingSource || 'Institutional Reserves']
            );
        } else {
            return res.status(400).json({ error: 'You have already signed this expense or it is already fully approved.' });
        }

        logActivity('Expense Approved', 'Expense', req.params.id, `Signature ${expense.approver2_id ? '3' : expense.approver1_id ? '2' : '1'} by ${adminName}`);
        res.json({ message: 'Approval signature recorded.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete expense
router.delete('/:id', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const expense = await dbGet('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        // Remove from ledger (transactions table)
        // We match by description pattern or we could have stored transactionId in expenses.
        // For now, let's use the description pattern.
        await dbRun('DELETE FROM transactions WHERE description LIKE ? AND amount = ?', 
            [`%Expense: ${expense.category}%`, expense.amount]);

        // Delete the file if it exists
        if (expense.receiptFilename) {
            const fp = path.join(__dirname, '../uploads/', expense.receiptFilename);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }

        await dbRun('DELETE FROM expenses WHERE id = ?', [req.params.id]);
        
        logActivity('Expense Deleted', 'Expense', req.params.id, `Removed: ${expense.category} of KES ${expense.amount}`);
        res.json({ message: 'Expense deleted and ledger updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate Voucher PDF
router.get('/:id/voucher.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const expense = await dbGet('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="voucher_${expense.id}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);
        await drawReportHeader(doc, 'Payment Voucher');
        
        doc.fontSize(10).font('Helvetica-Bold').text(`Voucher No: PV-${expense.id.toString().padStart(5, '0')}`, 50, 130);
        doc.text(`Date: ${new Date(expense.expenseDate).toLocaleDateString()}`, 350, 130);
        
        doc.y = 160;
        doc.fontSize(12).text('PARTICULARS OF PAYMENT');
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(`Category: ${expense.category}`);
        doc.text(`Description: ${expense.description}`);
        doc.text(`Recipient: ${expense.recipient || 'N/A'}`);
        doc.moveDown();
        doc.fontSize(14).font('Helvetica-Bold').text(`TOTAL AMOUNT: KES ${Number(expense.amount).toLocaleString()}`, { align: 'right' });

        // Signatures section
        doc.y = 400;
        doc.fontSize(10).font('Helvetica-Bold').text('APPROVALS:', 50, doc.y);
        doc.moveDown();
        doc.fontSize(9).font('Helvetica').text(`Recorded By: ${expense.recordedBy || expense.createdBy}`);
        doc.text(`Approver 1: ${expense.approver1_name || 'Pending'}`);
        doc.text(`Approver 2: ${expense.approver2_name || 'Pending'}`);
        doc.text(`Status: ${expense.status.toUpperCase()}`);

        drawPageFooter(doc);
        doc.end();
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

module.exports = router;
