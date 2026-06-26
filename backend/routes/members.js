const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { 
    dbAll, dbGet, dbRun, 
    normalizePhone, sanitizeFilename, 
    getMemberPhoto, getSystemSettings, getLocalIP 
} = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const { 
    drawReportHeader, drawSummaryCard, 
    drawTableHeader, drawPageFooter, 
    drawReportNote, drawIDCardBack 
} = require('../utils/pdf');
const { 
    authRequired, sharedAdminRequired, 
    secretaryRequired, financeRequired,
    ictRequired
} = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const multer  = require('multer');

// --- Multer Setup for KYC ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `DOC_${req.params.id}_${Date.now()}${ext}`;
        cb(null, name);
    }
});
const upload = multer({ storage });

// --- Helper for Month-End ---
function getLastDayOfFollowingMonth(baseStr) {
    const now = new Date();
    let from = (baseStr && !isNaN(new Date(baseStr).getTime())) ? new Date(baseStr) : now;
    if (from < now) from = now;
    return new Date(from.getFullYear(), from.getMonth() + 2, 0).toISOString();
}

// --- Routes ---

router.get('/', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const { search } = req.query;
        let sql = "SELECT * FROM members WHERE status != 'closed'";
        let params = [];
        if (search) {
            sql = "SELECT * FROM members WHERE status != 'closed' AND (name LIKE ? OR phone LIKE ? OR membershipNumber LIKE ?)";
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }
        sql += ' ORDER BY name ASC';
        const rows = await dbAll(sql, params);
        res.json({ members: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pending', authRequired, secretaryRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM members WHERE status = "pending" ORDER BY joinDate DESC');
        res.json({ members: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/approve/:id', authRequired, secretaryRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Member not found' });
        
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const hash = bcrypt.hashSync(pin, 10);
        
        await dbRun('UPDATE members SET status = "active", password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, req.params.id]);
        
        // Notify member
        const msg = `[LLUCG] Congratulations ${member.name}! Your membership application has been approved. Login to the portal at http://llucg.portal with phone and PIN: ${pin}`;
        await sendSMS([member.phone], msg, 'approval');
        
        logActivity('Approved Member', 'Member', req.params.id, `Approved by ${req.admin.username}`);
        
        await createNotification(
            req.params.id, 'member',
            'Account Activated',
            'Welcome! Your membership application has been approved. You can now access all portal features.',
            '/member/portal/overview', 'success'
        );

        res.json({ success: true, message: 'Member approved and notified.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/tiers', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const tiers = await dbAll('SELECT * FROM contribution_tiers ORDER BY monthlyTarget ASC');
        res.json({ tiers });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pending-closures', authRequired, ictRequired, async (req, res) => {
    try {
        const members = await dbAll(`
            SELECT m.*, 
            (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE memberId = m.id AND type IN ('SAVINGS', 'SHARE_CAPITAL')) as totalSavings
            FROM members m 
            WHERE m.status = 'pending_closure'
        `);
        res.json(members);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Member not found' });
        res.json({ member });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/balance', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const memberId = req.params.id;
        const [savings, loans, pens] = await Promise.all([
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE memberId = ? AND status='completed'", [memberId]),
            dbAll("SELECT l.*, (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = l.id) as paid FROM loans l WHERE l.memberId = ? AND l.status='active'", [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM penalties WHERE memberId = ? AND paidStatus='unpaid'", [memberId])
        ]);
        const debt = loans.reduce((s, l) => s + (l.amount - l.paid), 0);
        res.json({
            walletBalance: savings.t - debt - pens.t,
            totalSavings: savings.t,
            outstandingDebt: debt,
            unpaidPenalties: pens.t
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/history', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const payments = await dbAll('SELECT * FROM payments WHERE memberId = ? ORDER BY paymentDate DESC', [req.params.id]);
        const stats = await dbGet(`SELECT COUNT(*) as paymentCount, COALESCE(SUM(amount),0) as totalPaid, MAX(paymentDate) as lastPaymentDate FROM payments WHERE memberId = ? AND status='completed'`, [req.params.id]);
        const joinDate = new Date(member.joinDate);
        const monthsActive = Math.max(1, Math.round((new Date() - joinDate) / (1000 * 60 * 60 * 24 * 30)));

        res.json({ member, payments, stats: { ...stats, monthsActive } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/obligations', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const memberId = req.params.id;
        const [loans, penalties] = await Promise.all([
            dbAll(`
                SELECT l.id, l.amount, l.disbursedDate,
                       (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = l.id) as totalRepaid
                FROM loans l 
                WHERE l.memberId = ? AND l.status = 'active'
            `, [memberId]),
            dbAll(`
                SELECT id, amount, reason, issuedDate 
                FROM penalties 
                WHERE memberId = ? AND paidStatus = 'unpaid'
            `, [memberId])
        ]);

        const loanData = loans.map(l => {
            const balance = Math.max(0, l.amount - l.totalRepaid);
            return {
                id: l.id,
                label: `Loan #${l.id} (KES ${l.amount.toLocaleString()} - Bal: KES ${balance.toLocaleString()})`
            };
        });

        res.json({ loans: loanData, penalties });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authRequired, secretaryRequired, async (req, res) => {
    const { 
        name, phone, joinDate, nextDueDate, nextOfKinName, nextOfKinPhone, nextOfKinRelation, 
        idNumber, dateOfBirth, email, emergencyContact, emergencyPhone, tierId 
    } = req.body;
    
    // Enforce strict month-end policy
    const normalizedDue = getLastDayOfFollowingMonth(nextDueDate);
    
    if (!name || !phone || !joinDate)
        return res.status(400).json({ error: 'Name, phone, and joinDate are required.' });

    try {
        const normPhone = normalizePhone(phone);
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const hash = bcrypt.hashSync(pin, 10);

        const r = await dbRun(
            'INSERT INTO members (name, phone, joinDate, nextDueDate, nextOfKinName, nextOfKinPhone, nextOfKinRelation, idNumber, dateOfBirth, email, emergencyContact, emergencyPhone, tierId, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [
                name, normPhone, joinDate, normalizedDue, nextOfKinName || '', nextOfKinPhone || '', nextOfKinRelation || '', 
                idNumber || '', dateOfBirth || '', email || '', emergencyContact || '', emergencyPhone || '', tierId || null, hash
            ]
        );

        const idStr = `LLUCG-${(r.lastID).toString().padStart(3, '0')}`;
        await dbRun('UPDATE members SET membershipNumber = ? WHERE id = ?', [idStr, r.lastID]);

        const welcomeMsg = `[LLUCG] Welcome to LIFE-LONG UNITY CAPITAL GROUP! Log in at the portal using your phone and PIN: ${pin}`;
        await sendSMS([normPhone], welcomeMsg, 'system');

        logActivity('Created Member', 'Member', r.lastID, `Added member: ${name}`);
        
        await createNotification(
            r.lastID, 'member',
            'Welcome to LLUCG!',
            `Your account has been created. Your membership number is ${idStr}.`,
            '/member/portal/overview', 'info'
        );

        res.json({ id: r.lastID, name, phone, joinDate, nextDueDate: normalizedDue, status: 'active' });
    } catch (err) { 
        if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'A member with this phone number already exists.' });
        res.status(400).json({ error: err.message }); 
    }
});

router.put('/:id', authRequired, secretaryRequired, async (req, res) => {
    const {
        name,
        phone,
        joinDate,
        nextDueDate,
        status,
        nextOfKinName,
        nextOfKinPhone,
        nextOfKinRelation,
        idNumber,
        dateOfBirth,
        email,
        emergencyContact,
        emergencyPhone,
        tierId,
        membershipNumber // optional new field
    } = req.body;
    const normPhone = normalizePhone(phone);
    try {
        const r = await dbRun(
            `UPDATE members SET
                name = ?,
                phone = ?,
                joinDate = ?,
                nextDueDate = ?,
                status = ?,
                nextOfKinName = ?,
                nextOfKinPhone = ?,
                nextOfKinRelation = ?,
                idNumber = ?,
                dateOfBirth = ?,
                email = ?,
                emergencyContact = ?,
                emergencyPhone = ?,
                tierId = ?,
                membershipNumber = COALESCE(?, membershipNumber)
            WHERE id = ?`,
            [
                name,
                normPhone,
                joinDate,
                nextDueDate,
                status,
                nextOfKinName || '',
                nextOfKinPhone || '',
                nextOfKinRelation || '',
                idNumber || '',
                dateOfBirth || '',
                email || '',
                emergencyContact || '',
                emergencyPhone || '',
                tierId || null,
                membershipNumber || null,
                req.params.id
            ]
        );
        if (r.changes === 0) return res.status(404).json({ error: 'Member not found' });
        logActivity('Updated', 'Member', req.params.id, `Edited member: ${name}`);
        res.json({ message: 'Member updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', authRequired, ictRequired, async (req, res) => {
    try {
        const m = await dbGet('SELECT name FROM members WHERE id = ?', [req.params.id]);
        if (!m) return res.status(404).json({ error: 'Member not found' });
        
        const activeGuarantee = await dbGet(`SELECT l.id FROM loan_guarantors g JOIN loans l ON g.loanId = l.id WHERE g.memberId = ? AND l.status != 'repaid'`, [req.params.id]);
        if (activeGuarantee) return res.status(400).json({ error: 'Cannot delete member: They are actively guaranteeing an unpaid loan.' });

        await dbRun('DELETE FROM members WHERE id = ?', [req.params.id]);
        logActivity('Delete Member', 'Member', req.params.id, `Deleted by ${req.admin.username}`);
        res.json({ message: 'Member deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/settlement-audit', authRequired, async (req, res) => {
    const isFinance = ['superadmin', 'finance_admin', 'treasurer'].includes(req.admin.role);
    const isICT = ['superadmin', 'ict_admin'].includes(req.admin.role);
    if (!isFinance && !isICT) return res.status(403).json({ error: 'Access denied: Finance or ICT privileges required.' });
    const memberId = req.params.id;
    try {
        const [member, loans, penalties, pledges, withdrawals, savings] = await Promise.all([
            dbGet('SELECT name, membershipNumber, status FROM members WHERE id = ?', [memberId]),
            dbAll('SELECT id, amount, (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = loans.id) as repaid FROM loans WHERE memberId = ? AND status != "repaid"', [memberId]),
            dbAll('SELECT id, amount, reason FROM penalties WHERE memberId = ? AND paidStatus = "unpaid"', [memberId]),
            dbAll('SELECT id, targetDate FROM pledges WHERE memberId = ? AND status = "active"', [memberId]),
            dbAll('SELECT id, amount, status FROM withdrawals WHERE memberId = ? AND status = "pending"', [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')", [memberId])
        ]);

        if (!member) return res.status(404).json({ error: 'Member not found' });

        const loanDebt = loans.reduce((acc, l) => acc + (l.amount - l.repaid), 0);
        const penaltyDebt = penalties.reduce((acc, p) => acc + p.amount, 0);
        const totalDebt = loanDebt + penaltyDebt;

        const checklist = [
            { id: 'loans', label: 'Loans Clearing', status: loanDebt > 0 ? 'blocked' : 'ready', value: loanDebt, details: `${loans.length} active loans` },
            { id: 'penalties', label: 'Penalty Settlement', status: penaltyDebt > 0 ? 'blocked' : 'ready', value: penaltyDebt, details: `${penalties.length} unpaid penalties` },
            { id: 'pledges', label: 'Pledge Fulfillment', status: pledges.length > 0 ? 'blocked' : 'ready', value: pledges.length, details: `${pledges.length} active pledges` },
            { id: 'withdrawals', label: 'Pending Withdrawals', status: withdrawals.length > 0 ? 'warning' : 'ready', value: withdrawals.length, details: `${withdrawals.length} requests in progress` }
        ];

        const isReady = checklist.every(c => c.status !== 'blocked');

        res.json({
            member,
            checklist,
            totalSavings: savings.t,
            totalDebt,
            netSettlement: savings.t - totalDebt,
            isReady
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/clearance-certificate.pdf', authRequired, financeRequired, async (req, res) => {
    const memberId = req.params.id;
    try {
        const [member, audit] = await Promise.all([
            dbGet('SELECT * FROM members WHERE id = ?', [memberId]),
            (async () => {
                const [loans, penalties, pledges, savings] = await Promise.all([
                    dbAll('SELECT id, amount, (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = loans.id) as repaid FROM loans WHERE memberId = ? AND status != "repaid"', [memberId]),
                    dbAll('SELECT amount FROM penalties WHERE memberId = ? AND paidStatus = "unpaid"', [memberId]),
                    dbAll('SELECT id FROM pledges WHERE memberId = ? AND status = "active"', [memberId]),
                    dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')", [memberId])
                ]);
                const loanDebt = loans.reduce((acc, l) => acc + (l.amount - l.repaid), 0);
                const penaltyDebt = penalties.reduce((acc, p) => acc + p.amount, 0);
                return { loanDebt, penaltyDebt, activePledges: pledges.length, totalSavings: savings.t };
            })()
        ]);

        if (!member) return res.status(404).json({ error: 'Member not found' });

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Clearance_${member.membershipNumber}.pdf`);
        doc.pipe(res);

        await drawReportHeader(doc, 'FINANCIAL CLEARANCE CERTIFICATE');

        doc.fontSize(14).font('Helvetica-Bold').text('CERTIFICATE OF FULL SETTLEMENT', { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(11).font('Helvetica').text(`This is to certify that: `, { continued: true });
        doc.font('Helvetica-Bold').text(member.name);
        doc.font('Helvetica').text(`Membership Number: `, { continued: true });
        doc.font('Helvetica-Bold').text(member.membershipNumber);
        doc.moveDown(1.5);

        doc.font('Helvetica').text('Has undergone a comprehensive financial compliance audit and the following standing has been verified as of ', { continued: true });
        doc.font('Helvetica-Bold').text(`${new Date().toLocaleDateString('en-GB')}:`);
        doc.moveDown(1.5);

        // Audit Table
        const tableTop = doc.y;
        doc.rect(50, tableTop, 500, 20).fill('#f3f4f6').stroke('#e5e7eb');
        doc.fill('#374151').fontSize(10).font('Helvetica-Bold');
        doc.text('AUDIT PILLAR', 60, tableTop + 5);
        doc.text('STATUS', 300, tableTop + 5);
        doc.text('OUTSTANDING', 450, tableTop + 5);

        let y = tableTop + 25;
        const rows = [
            { label: 'Outstanding Loan Balance', val: audit.loanDebt, type: 'debt' },
            { label: 'Unpaid Penalties & Fines', val: audit.penaltyDebt, type: 'debt' },
            { label: 'Active Welfare Pledges', val: audit.activePledges, type: 'count' },
            { label: 'Total Managed Savings', val: audit.totalSavings, type: 'credit' }
        ];

        rows.forEach(row => {
            doc.fill('#000').font('Helvetica').fontSize(10);
            doc.text(row.label, 60, y);
            const status = (row.type === 'debt' || row.type === 'count') ? (row.val === 0 ? 'CLEARED' : 'PENDING') : 'ACCUMULATED';
            doc.text(status, 300, y);
            doc.text(row.type === 'count' ? row.val.toString() : `KES ${row.val.toLocaleString()}`, 450, y);
            y += 20;
        });

        doc.moveDown(3);
        const isClear = audit.loanDebt === 0 && audit.penaltyDebt === 0 && audit.activePledges === 0;
        doc.fontSize(11).font('Helvetica-Bold').text('Final Verdict: ', { continued: true });
        doc.fill(isClear ? '#10b981' : '#ef4444').text(isClear ? 'FULLY CLEARED & ELIGIBLE FOR SETTLEMENT' : 'SETTLEMENT BLOCKED - OBLIGATIONS PENDING');

        doc.fill('#000').font('Helvetica').moveDown(2);
        doc.text('Net Settlable Amount: ', { continued: true });
        doc.font('Helvetica-Bold').text(`KES ${(audit.totalSavings - (audit.loanDebt + audit.penaltyDebt)).toLocaleString()}`);

        doc.moveDown(4);
        doc.fontSize(9).font('Helvetica-Oblique').text('This document is electronically generated and verified by the LLUCG Finance Intelligence Unit.', { align: 'center' });

        drawPageFooter(doc);
        doc.end();

        logActivity('Generated Clearance', 'Member', memberId, `Generated for ${member.name}`);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/request-closure', authRequired, financeRequired, async (req, res) => {
    const memberId = req.params.id;
    try {
        const [loans, penalties, pledges] = await Promise.all([
            dbAll('SELECT id FROM loans WHERE memberId = ? AND status != "repaid"', [memberId]),
            dbAll('SELECT id FROM penalties WHERE memberId = ? AND paidStatus = "unpaid"', [memberId]),
            dbAll('SELECT id FROM pledges WHERE memberId = ? AND status = "active"', [memberId])
        ]);

        if (loans.length > 0 || penalties.length > 0 || pledges.length > 0) {
            return res.status(400).json({ error: 'Initiation Blocked: Member must be fully cleared before requesting closure.' });
        }

        await dbRun('UPDATE members SET status = "pending_closure" WHERE id = ?', [memberId]);
        logActivity('Closure Initiated', 'Member', memberId, `Exit process initiated by Finance (${req.admin.username}). Awaiting ICT finalization.`);

        res.json({ message: 'Exit process successfully initiated. The account has been moved to the ICT Authorization queue.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/settle-and-close', authRequired, ictRequired, async (req, res) => {
    const memberId = req.params.id;
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });
        
        if (member.status !== 'pending_closure') {
            return res.status(400).json({ error: 'Authorization Denied: This account has not been cleared for exit by the Finance team.' });
        }

        // 1. Calculate and zero out each balance type precisely
        const balances = await dbAll(
            "SELECT type, COALESCE(SUM(amount), 0) as balance FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL', 'PERSONAL') GROUP BY type",
            [memberId]
        );
        
        let totalPayout = 0;
        const now = new Date().toISOString();

        for (const bal of balances) {
            if (bal.balance > 0) {
                totalPayout += bal.balance;
                // Zero out this specific type in ledger
                await dbRun(
                    "INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, 'Account Settlement Payout', 'system', ?)",
                    [memberId, bal.type, -bal.balance, now]
                );
            }
        }

        // 2. Record the global payout and payment entry if there is a balance
        if (totalPayout > 0) {
            // Record as a system-wide debit transaction
            await dbRun(
                "INSERT INTO transactions (type, amount, description, performed_by, timestamp) VALUES ('debit', ?, ?, ?, ?)",
                [totalPayout, `Settlement Payout: ${member.name} (${member.membershipNumber})`, req.admin.username, now]
            );
            // Record in payments table to reduce Total Capital and Liquidity
            await dbRun(
                "INSERT INTO payments (memberId, amount, paymentDate, status, reference, walletType, note) VALUES (?, ?, ?, 'completed', ?, 'Savings Settlement', ?)",
                [memberId, -totalPayout, now, `SETTLE-${memberId}`, `Final payout for ${member.name}`]
            );
        }

        // 3. Finalize closure
        await dbRun('UPDATE members SET status = "closed" WHERE id = ?', [memberId]);
        logActivity('Account Closed', 'Member', memberId, `Final settlement of KES ${totalPayout.toLocaleString()} authorized and account permanently closed by ICT (${req.admin.username})`);

        res.json({ 
            message: `Account for ${member.name} has been successfully closed. Settlement payout of KES ${totalPayout.toLocaleString()} has been recorded across all balance types.`,
            payout: totalPayout
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/clearance-certificate.pdf', authRequired, async (req, res) => {
    const memberId = req.params.id;
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const [loans, penalties, pledges, savings] = await Promise.all([
            dbAll('SELECT * FROM loans WHERE memberId = ? AND status = "active"', [memberId]),
            dbAll('SELECT * FROM penalties WHERE memberId = ? AND status = "unpaid"', [memberId]),
            dbAll('SELECT * FROM pledges WHERE memberId = ? AND status = "pending"', [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as total FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')", [memberId])
        ]);

        if (loans.length > 0 || penalties.length > 0 || pledges.length > 0) {
            return res.status(400).json({ error: 'Clearance Blocked: Outstanding obligations must be settled first.' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Clearance_${member.membershipNumber}.pdf"`);

        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Certificate of Financial Clearance');

        doc.moveDown(2);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text('TO WHOM IT MAY CONCERN', { align: 'center' });
        doc.moveDown(1.5);

        const text = `This is to certify that ${member.name} (Member No: ${member.membershipNumber}) has been fully cleared of all financial obligations with the Capital Group as of ${new Date().toLocaleDateString('en-GB')}.`;
        doc.fontSize(11).font('Helvetica').fillColor('#334155').text(text, { align: 'justify', lineGap: 5 });

        doc.moveDown(2);
        
        // Summary Cards
        const startY = doc.y;
        drawSummaryCard(doc, 'Status', 'FULLY CLEARED', '#22c55e', 50, startY, 160);
        drawSummaryCard(doc, 'Final Savings', `KES ${savings.total.toLocaleString()}`, '#3b82f6', 220, startY, 160);
        drawSummaryCard(doc, 'Outstanding', 'KES 0.00', '#94a3b8', 390, startY, 160);

        doc.y += 70; // Move down below cards

        const note = "The member is now eligible for account closure and final dividend processing (where applicable). All voting rights and community access will be revoked upon final ICT authorization.";
        await drawReportNote(doc, note);

        doc.moveDown(4);
        drawSignatureBlock(doc, 'CHIEF FINANCIAL OFFICER', doc.y);

        drawPageFooter(doc);
        doc.end();

        logActivity('Clearance Generated', 'Member', memberId, `Clearance certificate generated for ${member.name}`);
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

// --- KYC Documents ---

router.get('/:id/documents', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const docs = await dbAll('SELECT * FROM member_documents WHERE memberId = ? ORDER BY uploadDate DESC', [req.params.id]);
        res.json({ documents: docs || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/documents', authRequired, upload.single('file'), async (req, res) => {
    const { documentType } = req.body;
    const filename = req.file?.filename;
    if (!filename) return res.status(400).json({ error: 'No file uploaded.' });

    try {
        await dbRun('INSERT INTO member_documents (memberId, documentType, filename, uploadDate) VALUES (?, ?, ?, ?)',
            [req.params.id, documentType || 'Other', filename, new Date().toISOString()]);
        res.json({ filename, documentType, message: 'Document uploaded.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/documents/:docId', authRequired, async (req, res) => {
    try {
        const doc = await dbGet('SELECT filename FROM member_documents WHERE id = ? AND memberId = ?', [req.params.docId, req.params.id]);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        await dbRun('DELETE FROM member_documents WHERE id = ?', [req.params.docId]);
        const fp = path.join(__dirname, '../uploads/', doc.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);

        res.json({ message: 'Document deleted.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Security Actions ---

router.get('/:id/reset-code', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT name, reset_otp as code, reset_otp_expiry as expiry FROM members WHERE id = ?', [req.params.id]);
        if (!member || !member.code) return res.json({ message: 'No active reset code.' });
        
        // Log this sensitive access
        logActivity('View Recovery Code', 'Member', req.params.id, `Manual code retrieval for ${member.name} by ${req.admin.username}`);
        
        res.json({ code: member.code, expiry: member.expiry });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/flag-reset', authRequired, ictRequired, async (req, res) => {
    try {
        await dbRun('UPDATE members SET must_change_password = 1 WHERE id = ?', [req.params.id]);
        logActivity('Admin Req Reset', 'Member', req.params.id, `Flagged for reset by ${req.admin.username}`);
        res.json({ message: 'Member flagged for password reset.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/unflag-reset', authRequired, ictRequired, async (req, res) => {
    try {
        await dbRun('UPDATE members SET must_change_password = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Reset flag cleared.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/set-password', authRequired, ictRequired, async (req, res) => {
    const { password, sendSms } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required.' });

    try {
        const hash = bcrypt.hashSync(password, 10);
        await dbRun('UPDATE members SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, req.params.id]);
        
        if (sendSms) {
            const member = await dbGet('SELECT phone FROM members WHERE id = ?', [req.params.id]);
            await sendSMS([member.phone], `[LLUCG] Your portal PIN has been updated by admin to: ${password}. Please change it after login.`, 'security');
        }

        logActivity('Admin Set PIN', 'Member', req.params.id, `PIN manually set by ${req.admin.username}`);
        res.json({ message: 'PIN updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/lifecycle-override', authRequired, ictRequired, async (req, res) => {
    const { phase } = req.body;
    try {
        await dbRun('UPDATE members SET lifecycle_phase_override = ? WHERE id = ?', [phase || null, req.params.id]);
        logActivity('Lifecycle Override', 'Member', req.params.id, `Manual phase override set to: ${phase || 'Auto'} by ${req.admin.username}`);
        res.json({ message: 'Member lifecycle phase updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/pledge', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT nextDueDate, name, phone FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const settings = await getSystemSettings();
        const fee = parseFloat(settings.pledge_fee || 100);
        const duration = parseInt(settings.pledge_duration || 14);

        const current = new Date(member.nextDueDate);
        current.setDate(current.getDate() + duration);
        const next = current.toISOString().split('T')[0];

        // 1. Update member due date
        await dbRun('UPDATE members SET nextDueDate = ? WHERE id = ?', [next, req.params.id]);
        
        // 2. Create a penalty record for the commitment fee to allow tracking/payment
        const penRes = await dbRun(
            'INSERT INTO penalties (memberId, amount, reason, issuedDate, paidStatus) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, fee, `Commitment Fee for Pledge (Deadline: ${next})`, new Date().toISOString(), 'unpaid']
        );
        const penaltyId = penRes.lastID;

        // 3. Insert pledge record with the linked penaltyId
        await dbRun(
            'INSERT INTO pledges (memberId, pledgeFee, targetDate, status, timestamp, penaltyId) VALUES (?, ?, ?, ?, ?, ?)',
            [req.params.id, fee, next, 'active', new Date().toISOString(), penaltyId]
        );

        await sendSMS([member.phone], `[LLUCG] Your pledge of KES ${fee} has been recorded. Your new due date is ${next}.`, 'pledge');
        logActivity('Pledge Recorded', 'Member', req.params.id, `Extended due date to ${next} (Fee KES ${fee})`);
        res.json({ message: `Pledge recorded for ${member.name} and due date extended to ${next}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PDF Statements & Cards ---

router.get('/:id/id-card.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const s = await getSystemSettings();
        const orgName = s.organization_name || 'LLUCG';
        
        const verifyUrl = `${process.env.APP_FRONTEND_URL || `http://${getLocalIP()}:8080`}/verify/${member.membershipNumber}`;
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200, color: { dark: '#1e293b', light: '#ffffff' } });

        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ID_Card_${member.membershipNumber}.pdf"`);
        doc.pipe(res);

        const cw = 241;
        const ch = 153;
        const gap = 20;
        const totalW = cw + gap + cw;
        const cx = (595 - totalW) / 2;
        const cy = 150;

        doc.save();
        doc.roundedRect(cx, cy, cw, ch, 10).clip();
        
        // Background
        const grad = doc.linearGradient(cx, cy, cx, cy + ch);
        grad.stop(0, '#1e293b').stop(1, '#0f172a');
        doc.rect(cx, cy, cw, ch).fill(grad);

        // Top Header
        doc.rect(cx, cy, cw, 34).fill('#334155');
        const logoPath = path.join(__dirname, '../assets/logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, cx + 10, cy + 6, { width: 22, height: 22 });
        }
        
        // Org Name
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(orgName.toUpperCase(), cx + 40, cy + 12, { width: cw - 50, ellipsis: true });
        
        // Photo Section
        const photoPath = await getMemberPhoto(member.id);
        if (photoPath) {
            doc.save();
            doc.roundedRect(cx + 12, cy + 48, 60, 75, 4).clip();
            doc.image(photoPath, cx + 12, cy + 48, { width: 60, height: 75, cover: [60, 75] });
            doc.restore();
            doc.roundedRect(cx + 12, cy + 48, 60, 75, 4).lineWidth(1.5).stroke('#fbbf24');
        } else {
            doc.roundedRect(cx + 12, cy + 48, 60, 75, 4).fill('#475569');
            doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(8).text('NO PHOTO', cx + 12, cy + 80, { width: 60, align: 'center' });
        }

        // Details
        let textY = cy + 50;
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text((member.name || '').toUpperCase(), cx + 80, textY, { width: cw - 85, ellipsis: true });
        
        textY += 20;
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('MEMBER ID', cx + 80, textY);
        doc.fillColor('#fbbf24').font('Helvetica-Bold').fontSize(10).text(member.membershipNumber || '---', cx + 80, textY + 9);
        
        textY += 24;
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('JOIN DATE', cx + 80, textY);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(new Date(member.joinDate).toLocaleDateString(), cx + 80, textY + 9);

        // QR Code removed as requested
        
        doc.restore();

        drawIDCardBack(doc, cx + cw + gap, cy, cw, ch);
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/statement.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const memberId = req.params.id;
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const [payments, loans, penalties] = await Promise.all([
            dbAll('SELECT * FROM payments WHERE memberId=? AND status="completed" ORDER BY paymentDate DESC', [memberId]),
            dbAll(`SELECT l.*, COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId=l.id),0) as totalRepaid FROM loans l WHERE l.memberId=? ORDER BY l.disbursedDate DESC`, [memberId]),
            dbAll('SELECT * FROM penalties WHERE memberId=? ORDER BY issuedDate DESC', [memberId])
        ]);

        const totalSaved = payments.reduce((s, p) => s + p.amount, 0);
        const totalPen   = penalties.reduce((s, p) => s + p.amount, 0);
        const paidPen    = penalties.filter(p => p.paidStatus === 'paid').reduce((s, p) => s + p.amount, 0);
        const loanBal    = loans.reduce((s, l) => s + Math.max(0, l.amount - (l.totalRepaid || 0)), 0);

        const safeName   = sanitizeFilename(member.name);
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`attachment; filename="statement_${safeName}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Member Account Statement');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(member.name.toUpperCase());
        doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text(`Member ID: #${member.id} | Joined: ${new Date(member.joinDate).toLocaleDateString()} | Status: ${member.status.toUpperCase()}`);
        doc.moveDown(1.2);

        const startY = doc.y;
        drawSummaryCard(doc, 'Total Savings', `KES ${totalSaved.toLocaleString()}`, '#10b981', 50, startY);
        drawSummaryCard(doc, 'Loan Balance', `KES ${loanBal.toLocaleString()}`, loanBal > 0 ? '#f43f5e' : '#64748b', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Unpaid Fines', `KES ${(totalPen - paidPen).toLocaleString()}`, (totalPen - paidPen) > 0 ? '#f43f5e' : '#64748b', 50 + (153 + 15) * 2, startY);
        doc.y = startY + 75;

        if (payments.length) {
            doc.fontSize(10).font('Helvetica-Bold').text('CONTRIBUTION LEDGER');
            const cols = [
                { label: 'Date', x: 60, width: 80 },
                { label: 'Reference', x: 140, width: 220 },
                { label: 'Category', x: 360, width: 100 },
                { label: 'Amount (KES)', x: 460, width: 70, align: 'right' }
            ];
            let curY = drawTableHeader(doc, cols, doc.y);
            payments.forEach((p, idx) => {
                if (curY > 740) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
                if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
                doc.fontSize(8).font('Helvetica').fillColor('#334155');
                doc.text(new Date(p.paymentDate).toLocaleDateString(), cols[0].x, curY);
                doc.text(p.reference || 'DIRECT', cols[1].x, curY);
                doc.text((p.walletType || 'SACCO Savings').toUpperCase(), cols[2].x, curY);
                doc.font('Helvetica-Bold').fillColor('#10b981').text(Number(p.amount).toLocaleString(), cols[3].x, curY, { width: cols[3].width, align: 'right' });
                curY += 18;
            });
            doc.y = curY + 20;
        }

        drawReportNote(doc, 'Verified CMS Statement.');
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/requests/phone-changes', authRequired, secretaryRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT id, name, phone, pending_phone, membershipNumber FROM members WHERE pending_phone IS NOT NULL');
        res.json({ requests: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/approve-phone/:id', authRequired, secretaryRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT name, pending_phone, phone FROM members WHERE id = ?', [req.params.id]);
        if (!member || !member.pending_phone) return res.status(404).json({ error: 'No pending phone change found.' });

        const oldPhone = member.phone;
        const newPhone = member.pending_phone;

        await dbRun('UPDATE members SET phone = ?, pending_phone = NULL WHERE id = ?', [newPhone, req.params.id]);
        
        logActivity('Phone Approved', 'Member', req.params.id, `Approved phone change from ${oldPhone} to ${newPhone} by ${req.admin.username}`);
        
        await sendSMS([newPhone], `[LLUCG] Hello ${member.name}, your phone number change has been approved. You can now use this number to log in.`, 'security');
        
        await createNotification(
            req.params.id, 'member',
            'Phone Number Updated',
            `Your request to change your phone number to ${newPhone} has been approved.`,
            '/member/portal/overview', 'success'
        );

        res.json({ message: 'Phone change approved and member notified.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/reject-phone/:id', authRequired, secretaryRequired, async (req, res) => {
    try {
        await dbRun('UPDATE members SET pending_phone = NULL WHERE id = ?', [req.params.id]);
        res.json({ message: 'Phone change request rejected.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
