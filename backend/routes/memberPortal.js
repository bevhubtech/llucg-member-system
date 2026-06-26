const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, sanitizeFilename, getSystemSettings } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { memberAuthRequired, highValueLock } = require('../middleware/auth');
const { sendSMS } = require('../utils/sms');
const { createNotification } = require('../utils/notifications');
const PDFDocument = require('pdfkit');
const { 
    drawReportHeader, drawSummaryCard, 
    drawTableHeader, drawPageFooter, 
    drawReportNote, drawSignatureBlock,
    drawWatermark
} = require('../utils/pdf');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// --- Multer Setup for KYC ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `DOC_${req.member.id}_${Date.now()}${ext}`;
        cb(null, name);
    }
});
const upload = multer({ storage });

router.get('/', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const [member, savings, debt, personalWallet, penalties, welfare, regCount] = await Promise.all([
            dbGet('SELECT m.*, t.name as tierName FROM members m LEFT JOIN contribution_tiers t ON m.tierId = t.id WHERE m.id = ?', [memberId]),
            // Use ledger as the authoritative source — it always has SAVINGS and WELFARE correctly separated
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')", [memberId]),
            dbGet("SELECT COALESCE(SUM(l.amount - (SELECT COALESCE(SUM(r.amount), 0) FROM loan_repayments r WHERE r.loanId = l.id)), 0) as t FROM loans l WHERE l.memberId = ? AND l.status='active'", [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type='PERSONAL'", [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM penalties WHERE memberId = ? AND paidStatus='unpaid'", [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type='WELFARE'", [memberId]),
            dbGet("SELECT COUNT(*) as c FROM payments WHERE memberId = ? AND walletType='Registration Fee' AND status='completed'", [memberId])
        ]);

        if (!member) return res.status(404).json({ error: 'Member profile not found.' });

        const totalSavings = savings.t;
        const pWallet = personalWallet.t;

        // Calculate borrowing limit logic (3x savings - current debt)
        const maxLimit = totalSavings * 3.0;
        const availableLimit = Math.max(0, maxLimit - debt.t);

        // Inject live stats into the member object for the dashboard
        // Field names must match MemberPortal.jsx expectations
        member.savings = totalSavings;
        member.currentDebt = debt.t;
        member.outstandingFees = penalties.t;
        member.availableLimit = availableLimit;
        member.personalWallet = pWallet;
        member.welfareBalance = welfare.t;
        member.registration_fee_paid = regCount.c > 0;
        member.walletBalance = pWallet; // Backwards compatibility if needed

        res.json(member);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/trust-score', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        
        // Multi-factor Trust Calculation
        const [payments, attendance, penalties, member] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM payments WHERE memberId = ? AND status="completed"', [memberId]),
            dbGet('SELECT COUNT(*) as c FROM meeting_attendance WHERE memberId = ? AND attended=1', [memberId]),
            dbGet('SELECT COUNT(*) as c FROM penalties WHERE memberId = ? AND paidStatus="unpaid"', [memberId]),
            dbGet('SELECT joinDate FROM members WHERE id = ?', [memberId])
        ]);

        let score = 50; // Starting base
        
        // 1. Payment Consistency (+2 per payment, cap 20)
        score += Math.min(20, payments.c * 2);
        
        // 2. Participation (+3 per meeting attended, cap 15)
        score += Math.min(15, attendance.c * 3);
        
        // 3. Loan/Penalty Discipline
        if (penalties.c > 0) {
            score -= (penalties.c * 10); // Heavy penalty for unpaid fines
        } else {
            score += 10; // Bonus for clean record
        }

        // 4. Seniority (+1 per month, cap 5)
        const joinDate = new Date(member.joinDate);
        const months = Math.floor((new Date() - joinDate) / (30 * 24 * 60 * 60 * 1000));
        score += Math.min(5, months);

        // Final Clamping
        score = Math.max(0, Math.min(100, score));
        
        let rating = 'Standard';
        if (score >= 90) rating = 'Platinum Elite';
        else if (score >= 80) rating = 'Excellent';
        else if (score >= 70) rating = 'Good';
        else if (score < 40) rating = 'Needs Improvement';

        res.json({ 
            score, 
            rating,
            factors: {
                payments: payments.c,
                attendance: attendance.c,
                penalties: penalties.c,
                seniorityMonths: months
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/balance', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const [savingsLedger, debt, welfare] = await Promise.all([
            // Use ledger as the authoritative source
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')", [memberId]),
            dbGet("SELECT COALESCE(SUM(amount - (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = l.id)), 0) as bal FROM loans l WHERE memberId = ? AND status='active'", [memberId]),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type='WELFARE'", [memberId])
        ]);
        res.json({ savings: savingsLedger.t, welfare: welfare.t, currentDebt: debt.bal, currency: 'KES' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments', memberAuthRequired, async (req, res) => {
    try {
        const payments = await dbAll('SELECT * FROM payments WHERE memberId = ? ORDER BY paymentDate DESC LIMIT 50', [req.member.id]);
        res.json({ payments });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ledger', memberAuthRequired, async (req, res) => {
    try {
        const ledger = await dbAll('SELECT * FROM ledger WHERE memberId = ? ORDER BY date DESC LIMIT 100', [req.member.id]);
        res.json({ ledger });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loans', memberAuthRequired, async (req, res) => {
    try {
        const loans = await dbAll('SELECT l.*, (SELECT COALESCE(SUM(amount),0) FROM loan_repayments WHERE loanId=l.id) as paid FROM loans l WHERE memberId = ? ORDER BY disbursedDate DESC', [req.member.id]);
        
        // Populate repayments for each loan so the frontend modal can display history
        for (let l of loans) {
            l.repayments = await dbAll('SELECT * FROM loan_repayments WHERE loanId = ? ORDER BY paidDate DESC', [l.id]);
        }
        
        res.json({ loans });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/penalties', memberAuthRequired, async (req, res) => {
    try {
        const penalties = await dbAll('SELECT * FROM penalties WHERE memberId = ? ORDER BY issuedDate DESC', [req.member.id]);
        res.json({ penalties });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/polls', memberAuthRequired, async (req, res) => {
    try {
        const polls = await dbAll('SELECT * FROM polls ORDER BY timestamp DESC', []);
        for (const p of polls) {
            p.options = await dbAll('SELECT * FROM poll_options WHERE pollId = ?', [p.id]);
            const vote = await dbGet('SELECT optionId FROM poll_votes WHERE pollId = ? AND memberId = ?', [p.id, req.member.id]);
            p.votedOption = vote ? vote.optionId : null;
            
            // If already voted or closed, include stats
            if (p.votedOption || p.status === 'closed') {
                const stats = await dbAll('SELECT optionId, COUNT(*) as count FROM poll_votes WHERE pollId = ? GROUP BY optionId', [p.id]);
                const total = stats.reduce((s, c) => s + c.count, 0);
                p.options.forEach(o => {
                    const s = stats.find(stat => stat.optionId === o.id);
                    o.votes = s ? s.count : 0;
                    o.percent = total > 0 ? Math.round((o.votes / total) * 100) : 0;
                });
                p.totalVotes = total;
            }
        }
        res.json({ polls });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/polls/:id/vote', memberAuthRequired, async (req, res) => {
    const { optionId } = req.body;
    if (!optionId) return res.status(400).json({ error: 'Option ID required.' });
    try {
        const poll = await dbGet('SELECT status FROM polls WHERE id = ?', [req.params.id]);
        if (!poll || poll.status !== 'active') return res.status(400).json({ error: 'Poll is not active or not found.' });

        await dbRun('INSERT INTO poll_votes (pollId, optionId, memberId, timestamp) VALUES (?, ?, ?, ?)',
            [req.params.id, optionId, req.member.id, new Date().toISOString()]);
        
        logActivity('Vote Cast', 'Poll', req.params.id, `Member voted for option ${optionId}`, req.member.name);
        res.json({ success: true, message: 'Vote recorded successfully.' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'You have already voted in this poll.' });
        res.status(500).json({ error: err.message });
    }
});

router.get('/pledges', memberAuthRequired, async (req, res) => {
    try {
        const pledges = await dbAll(`
            SELECT p.*, pen.paidStatus, pen.amount as feeAmount
            FROM pledges p
            LEFT JOIN penalties pen ON p.penaltyId = pen.id
            WHERE p.memberId = ? 
            ORDER BY p.timestamp DESC
        `, [req.member.id]);
        res.json({ pledges });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pledge', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const member = await dbGet('SELECT nextDueDate, name, phone FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const settings = await getSystemSettings();
        const fee = parseFloat(settings.pledge_fee || 100);
        const duration = parseInt(settings.pledge_duration || 14);

        const current = new Date(member.nextDueDate);
        current.setDate(current.getDate() + duration); // Extension policy from settings
        const next = current.toISOString().split('T')[0];

        // 1. Update member due date
        await dbRun('UPDATE members SET nextDueDate = ? WHERE id = ?', [next, memberId]);
        
        // 2. Create a penalty record for the commitment fee
        const penRes = await dbRun(
            'INSERT INTO penalties (memberId, amount, reason, issuedDate, paidStatus) VALUES (?, ?, ?, ?, ?)',
            [memberId, fee, `Self-Applied Pledge Commitment (New Deadline: ${next})`, new Date().toISOString(), 'unpaid']
        );
        const penaltyId = penRes.lastID;

        // 3. Insert pledge record with the linked penaltyId
        await dbRun(
            'INSERT INTO pledges (memberId, pledgeFee, targetDate, status, timestamp, penaltyId) VALUES (?, ?, ?, ?, ?, ?)',
            [memberId, fee, next, 'active', new Date().toISOString(), penaltyId]
        );

        await sendSMS([member.phone], `[LLUCG] Your pledge application for KES ${fee} has been approved. Your next contribution deadline is extended to ${next}.`, 'pledge');
        logActivity('Self-Pledge Applied', 'Member', memberId, `Extended due date to ${next} (Self-service)`, member.name);
        
        await createNotification(
            memberId, 'member',
            'Pledge Applied Successfully',
            `Your contribution deadline has been extended to ${next}. A commitment fee of KES ${fee} has been applied.`,
            '/member/portal/pledges', 'success'
        );

        res.json({ success: true, message: `Pledge applied. Your new deadline is ${next}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pledge-policy', memberAuthRequired, async (req, res) => {
    try {
        const settings = await getSystemSettings();
        res.json({
            fee: parseFloat(settings.pledge_fee || 100),
            duration: parseInt(settings.pledge_duration || 14)
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pledge-history.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        const pledges = await dbAll(`
            SELECT p.*, pen.paidStatus, pen.amount as feeAmount, pen.paidDate
            FROM pledges p
            LEFT JOIN penalties pen ON p.penaltyId = pen.id
            WHERE p.memberId = ? 
            ORDER BY p.timestamp DESC
        `, [memberId]);

        const doc = new PDFDocument({ margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Pledge_History_${member.membershipNumber}.pdf`);
        doc.pipe(res);

        await drawReportHeader(doc, 'PLEDGE & COMMITMENT HISTORY');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('MEMBER DETAILS', 50, doc.y);
        doc.fontSize(9).font('Helvetica').fillColor('#475569').text(`Name: ${member.name}`, 50, doc.y + 15);
        doc.text(`ID: ${member.membershipNumber}`, 50, doc.y + 27);
        doc.y += 60;

        const cols = [
            { label: 'Application Date', x: 50, width: 100 },
            { label: 'Extended Deadline', x: 150, width: 120 },
            { label: 'Fee', x: 270, width: 80 },
            { label: 'Payment Status', x: 350, width: 100 },
            { label: 'Fulfillment', x: 450, width: 100, align: 'right' }
        ];

        let y = drawTableHeader(doc, cols, doc.y);

        pledges.forEach(p => {
            if (y > 700) { doc.addPage(); y = drawTableHeader(doc, cols, 100); }
            doc.fontSize(8).font('Helvetica').fillColor('#475569');
            doc.text(new Date(p.timestamp).toLocaleDateString(), cols[0].x, y);
            doc.text(new Date(p.targetDate).toLocaleDateString(), cols[1].x, y);
            doc.text(`KES ${p.pledgeFee}`, cols[2].x, y);
            doc.font('Helvetica-Bold').fillColor(p.paidStatus === 'paid' ? '#10b981' : '#f59e0b');
            doc.text(p.paidStatus === 'paid' ? 'PAID' : 'PENDING', cols[3].x, y);
            doc.fillColor('#1e293b').text(p.paidStatus === 'paid' ? 'FULFILLED' : 'ACTIVE', cols[4].x, y, { align: 'right' });
            y += 20;
            doc.moveTo(50, y - 5).lineTo(550, y - 5).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        });

        if (pledges.length === 0) {
            doc.fontSize(10).font('Helvetica-Oblique').fillColor('#94a3b8').text('No pledge records found.', 50, y + 20, { align: 'center', width: 500 });
        }

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pledges/:id/receipt.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const pledge = await dbGet(`
            SELECT p.*, pen.paidStatus, pen.amount as feeAmount, pen.paidDate, m.name, m.membershipNumber
            FROM pledges p
            JOIN members m ON p.memberId = m.id
            LEFT JOIN penalties pen ON p.penaltyId = pen.id
            WHERE p.id = ? AND p.memberId = ?
        `, [req.params.id, memberId]);

        if (!pledge) return res.status(404).json({ error: 'Pledge record not found' });
        if (pledge.paidStatus !== 'paid') return res.status(400).json({ error: 'Receipt only available for fulfilled pledges' });

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Pledge_Receipt_${req.params.id}.pdf`);
        doc.pipe(res);

        await drawReportHeader(doc, 'PLEDGE COMMITMENT RECEIPT');
        
        // Compact Transaction Box
        const startY = doc.y;
        doc.rect(50, startY, 495, 90).fillColor('#f8fafc').fill();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('TRANSACTION DETAILS', 70, startY + 12);
        doc.fontSize(9).font('Helvetica').fillColor('#475569');
        doc.text(`Receipt No: PLD-${pledge.id}`, 70, startY + 30);
        doc.text(`Date: ${new Date(pledge.paidDate).toLocaleDateString()}`, 70, startY + 42);
        doc.text(`Member: ${pledge.name} (${pledge.membershipNumber})`, 70, startY + 54);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#10b981').text(`AMOUNT: KES ${pledge.pledgeFee.toLocaleString()}`, 70, startY + 70);
        
        doc.y = startY + 110;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('EXTENSION GRANTED');
        doc.fontSize(9).font('Helvetica').fillColor('#475569').text(`Contribution deadline extended to:`, 50, doc.y + 12);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#2563eb').text(new Date(pledge.targetDate).toLocaleDateString(), 50, doc.y + 25);

        doc.y += 60;
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#94a3b8').text('This is a system-generated receipt. All extensions are subject to verified ledger payments.', { width: 495 });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/documents', memberAuthRequired, async (req, res) => {
    try {
        const documents = await dbAll('SELECT * FROM member_documents WHERE memberId = ? ORDER BY uploadDate DESC', [req.member.id]);
        res.json({ documents });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/documents', memberAuthRequired, upload.single('file'), async (req, res) => {
    const { documentType } = req.body;
    const filename = req.file?.filename;
    
    if (!documentType || !filename) return res.status(400).json({ error: 'Document type and file are required.' });

    try {
        const memberId = req.member.id;
        const uploadDate = new Date().toISOString();
        
        await dbRun(
            'INSERT INTO member_documents (memberId, documentType, filename, uploadDate, uploadedBy) VALUES (?, ?, ?, ?, ?)',
            [memberId, documentType, filename, uploadDate, req.member.name]
        );
        
        logActivity('KYC Upload', 'Member', memberId, `Uploaded: ${documentType} (${filename})`, req.member.name);
        res.json({ message: 'Document uploaded successfully.', filename });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/documents/:id', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const docId = req.params.id;

        // Verify ownership
        const doc = await dbGet('SELECT * FROM member_documents WHERE id = ? AND memberId = ?', [docId, memberId]);
        if (!doc) return res.status(404).json({ error: 'Document not found or access denied.' });

        // Delete from filesystem
        const fp = path.join(__dirname, '..', 'uploads', doc.filename);
        if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
        }

        // Delete from DB
        await dbRun('DELETE FROM member_documents WHERE id = ?', [docId]);

        logActivity('KYC Deletion', 'Member', memberId, `Deleted: ${doc.documentType} (${doc.filename})`, req.member.name);
        res.json({ message: 'Document deleted successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/target-savings', memberAuthRequired, async (req, res) => {
    try {
        const pots = await dbAll('SELECT * FROM target_savings WHERE memberId = ? ORDER BY createdAt DESC', [req.member.id]);
        res.json({ pots });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/target-savings', memberAuthRequired, async (req, res) => {
    const { name, targetAmount, deadline } = req.body;
    if (!name || targetAmount <= 0) return res.status(400).json({ error: 'Valid name and target required.' });
    try {
        await dbRun('INSERT INTO target_savings (memberId, name, targetAmount, deadline, createdAt) VALUES (?, ?, ?, ?, ?)', 
            [req.member.id, name, targetAmount, deadline || null, new Date().toISOString()]);
        res.json({ message: 'Target pot created.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/target-savings/:id/fund', memberAuthRequired, async (req, res) => {
    const { amount } = req.body;
    const potId = req.params.id;
    if (amount <= 0) return res.status(400).json({ error: 'Valid amount required.' });

    try {
        const pot = await dbGet('SELECT * FROM target_savings WHERE id = ? AND memberId = ?', [potId, req.member.id]);
        if (!pot) return res.status(404).json({ error: 'Pot not found.' });

        const fundState = await dbGet(`
            SELECT COALESCE(SUM(CASE WHEN type='PERSONAL' THEN amount ELSE 0 END), 0) as personal
            FROM ledger WHERE memberId = ?
        `, [req.member.id]);

        if (fundState.personal < amount) {
            return res.status(400).json({ error: `Insufficient funds in Personal Wallet (Current: KES ${fundState.personal.toLocaleString()}). Please deposit funds via M-Pesa first.` });
        }

        // Debit Personal Wallet
        await dbRun('INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, ?, ?, ?)', 
            [req.member.id, 'PERSONAL', -amount, `Funding ${pot.name}`, 'internal', new Date().toISOString()]);
        
        // Credit the Pot
        await dbRun('UPDATE target_savings SET currentAmount = currentAmount + ? WHERE id = ?', [amount, pot.id]);
        await dbRun('INSERT INTO target_savings_ledger (potId, amount, description, timestamp) VALUES (?, ?, ?, ?)', 
            [pot.id, amount, 'Member Deposit', new Date().toISOString()]);

        res.json({ message: 'Pot funded successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/target-savings/:id/withdraw', memberAuthRequired, async (req, res) => {
    const { amount } = req.body;
    const potId = req.params.id;
    if (amount <= 0) return res.status(400).json({ error: 'Valid amount required.' });

    try {
        const pot = await dbGet('SELECT * FROM target_savings WHERE id = ? AND memberId = ?', [potId, req.member.id]);
        if (!pot) return res.status(404).json({ error: 'Pot not found.' });

        if (pot.currentAmount < amount) {
            return res.status(400).json({ error: 'Insufficient funds in this pot.' });
        }

        // 1. Debit the Pot
        await dbRun('UPDATE target_savings SET currentAmount = currentAmount - ? WHERE id = ?', [amount, pot.id]);
        await dbRun('INSERT INTO target_savings_ledger (potId, amount, description, timestamp) VALUES (?, ?, ?, ?)', 
            [pot.id, -amount, 'Member Withdrawal to Wallet', new Date().toISOString()]);
        logActivity('Savings Withdrawal', 'Member', req.member.id, `Withdrew KES ${amount} from ${pot.name} to Personal Wallet`, req.member.name);

        // Optional: If goal is 100% fulfilled and then fully emptied, we could close it, 
        // but user wants it to "function anytime", so let's keep it active.

        // 2. Credit Personal Wallet in main ledger
        await dbRun('INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, ?, ?, ?)', 
            [req.member.id, 'PERSONAL', amount, `Withdrawal from ${pot.name}`, 'internal', new Date().toISOString()]);
        
        res.json({ message: amount >= pot.currentAmount ? 'Goal closed and funds moved back to Wallet.' : 'Funds moved back to your Personal Wallet.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/target-savings/:id', memberAuthRequired, async (req, res) => {
    const potId = req.params.id;
    try {
        const pot = await dbGet('SELECT * FROM target_savings WHERE id = ? AND memberId = ?', [potId, req.member.id]);
        if (!pot) return res.status(404).json({ error: 'Pot not found.' });

        // If there's money in it, move it back to the wallet automatically
        if (pot.currentAmount > 0) {
            await dbRun('INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, ?, ?, ?)', 
                [req.member.id, 'PERSONAL', pot.currentAmount, `Closing Goal: ${pot.name}`, 'internal', new Date().toISOString()]);
        }

        await dbRun('DELETE FROM target_savings WHERE id = ?', [potId]);
        await dbRun('DELETE FROM target_savings_ledger WHERE potId = ?', [potId]);
        
        logActivity('Savings Goal Deleted', 'Member', req.member.id, `Deleted goal '${pot.name}' (Returned KES ${pot.currentAmount} to wallet)`, req.member.name);
        res.json({ message: 'Goal deleted successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/withdraw', memberAuthRequired, highValueLock, async (req, res) => {
    const { amount, phone } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required.' });

    try {
        const memberId = req.member.id;
        const targetPhone = phone || req.member.phone;

        // Check Personal Wallet Balance
        const wallet = await dbGet(`
            SELECT COALESCE(SUM(amount), 0) as balance 
            FROM ledger 
            WHERE memberId = ? AND type = 'PERSONAL'
        `, [memberId]);

        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient funds in Personal Wallet.' });
        }

        // 1. Debit Personal Wallet (Mark as pending withdrawal)
        await dbRun(
            'INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, ?, ?, ?)',
            [memberId, 'PERSONAL', -amount, `Pending Withdrawal to M-Pesa (${targetPhone})`, 'withdrawal', new Date().toISOString()]
        );

        // 2. Create Withdrawal Record
        const r = await dbRun(
            'INSERT INTO withdrawals (memberId, amount, phone, status, timestamp) VALUES (?, ?, ?, ?, ?)',
            [memberId, amount, targetPhone, 'pending', new Date().toISOString()]
        );

        logActivity('Withdrawal Requested', 'Member', memberId, `KES ${amount} to ${targetPhone}`, req.member.name);
        
        // Notify Admins
        const admins = await dbAll("SELECT id FROM admin_users WHERE role IN ('superadmin', 'finance_admin', 'treasurer')");
        for (const admin of admins) {
            await createNotification(admin.id, 'admin', 'New Withdrawal Request', `${req.member.name} has requested a withdrawal of KES ${Number(amount).toLocaleString()}.`, '/withdrawals', 'finance');
        }

        res.json({ id: r.lastID, message: 'Withdrawal request submitted for approval.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/withdrawals', memberAuthRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM withdrawals WHERE memberId = ? ORDER BY timestamp DESC', [req.member.id]);
        res.json({ withdrawals: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/wealth-history', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        // Calculate cumulative wealth by month for the last 12 active months
        // Includes: Completed Payments (Savings) + SHARE_CAPITAL from ledger (Dividends)
        const historyRows = await dbAll(`
            WITH RECURSIVE months(m) AS (
                SELECT strftime('%Y-%m-01', 'now', '-11 months')
                UNION ALL
                SELECT date(m, '+1 month') FROM months WHERE m < strftime('%Y-%m-01', 'now')
            ),
            member_activity AS (
                SELECT strftime('%Y-%m-01', paymentDate) as month, SUM(amount) as inc 
                FROM payments 
                WHERE memberId = ? AND status='completed' AND walletType NOT IN ('Registration Fee', 'Penalty', 'Welfare Fund', 'Welfare')
                GROUP BY month
                UNION ALL
                SELECT strftime('%Y-%m-01', date) as month, SUM(amount) as inc 
                FROM ledger
                WHERE memberId = ? AND type='SHARE_CAPITAL'
                GROUP BY month
            )
            SELECT strftime('%Y-%m', m) as month,
                   COALESCE((
                       SELECT SUM(inc) 
                       FROM member_activity 
                       WHERE month <= m
                   ), 0) as cumulativeWealth
            FROM months
            ORDER BY m ASC
        `, [memberId, memberId]);

        res.json({ history: historyRows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/eligibility', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const [savings, debt] = await Promise.all([
            dbGet(`SELECT COALESCE(SUM(amount), 0) as total FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')`, [memberId]),
            dbGet(`SELECT COALESCE(SUM(amount - (SELECT COALESCE(SUM(amount),0) FROM loan_repayments WHERE loanId=l.id)), 0) as total FROM loans l WHERE memberId=? AND l.status='active'`, [memberId])
        ]);
        const totalSavings = savings.total;
        const currentDebt = debt.total;
        const maxLimit = totalSavings * 3.0;
        const availableLimit = Math.max(0, maxLimit - currentDebt);
        res.json({ savings: totalSavings, totalSavings, maxLimit, currentDebt, availableLimit, rule: "3x Total Savings minus outstanding debt" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/applications', memberAuthRequired, highValueLock, async (req, res) => {
    const { amount, tenure, reason } = req.body;
    try {
        const timestamp = new Date().toISOString();
        const r = await dbRun('INSERT INTO loan_applications (memberId, amount, status, tenure, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [req.member.id, amount, 'pending', tenure, reason || '', timestamp]);
        
        logActivity('Loan Applied', 'Member', req.member.id, `KES ${amount} for ${tenure} months`, req.member.name);
        
        // Notify Admins
        const admins = await dbAll("SELECT id FROM admin_users WHERE role IN ('superadmin', 'finance_admin', 'ict_admin')");
        const { createNotification } = require('../utils/notifications');
        for (const admin of admins) {
            await createNotification(admin.id, 'admin', 'New Loan Application', `${req.member.name} has applied for a loan of KES ${Number(amount).toLocaleString()}.`, '/loan-apps', 'loan');
        }

        res.json({ id: r.lastID, message: 'Application submitted.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/applications', memberAuthRequired, async (req, res) => {
    try {
        const applications = await dbAll('SELECT * FROM loan_applications WHERE memberId = ? ORDER BY timestamp DESC', [req.member.id]);
        res.json({ applications });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meetings', memberAuthRequired, async (req, res) => {
    try {
        const meetings = await dbAll(`
            SELECT m.*, COALESCE(a.attended, 0) as attended, a.checkInTime
            FROM meetings m
            LEFT JOIN meeting_attendance a ON m.id = a.meetingId AND a.memberId = ?
            ORDER BY m.date DESC LIMIT 10
        `, [req.member.id]);
        res.json({ meetings });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/resolutions', memberAuthRequired, async (req, res) => {
    try {
        const resolutions = await dbAll('SELECT * FROM meeting_resolutions ORDER BY timestamp DESC LIMIT 10', []);
        res.json({ resolutions });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/contribution-trend', memberAuthRequired, async (req, res) => {
    try {
        const trend = await dbAll(`
            SELECT strftime('%Y-%m', paymentDate) as month, SUM(amount) as amount 
            FROM payments 
            WHERE memberId = ? AND status='completed' 
            GROUP BY month ORDER BY month ASC LIMIT 12
        `, [req.member.id]);
        res.json({ trend: trend || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/guarantor-requests', memberAuthRequired, async (req, res) => {
    try {
        const requests = await dbAll(`
            SELECT g.*, m.name as borrowerName, l.amount as loanAmount, l.dueDate, l.status as loanStatus,
                   (SELECT COALESCE(SUM(amount),0) FROM loan_repayments WHERE loanId = l.id) as totalRepaid,
                   l.originalPrincipal, l.totalInterest
            FROM loan_guarantors g
            JOIN loans l ON g.loanId = l.id
            JOIN members m ON l.memberId = m.id
            WHERE g.memberId = ?
            ORDER BY l.disbursedDate DESC
        `, [req.member.id]);
        res.json({ requests: requests || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dividends', memberAuthRequired, async (req, res) => {
    try {
        const dividends = await dbAll(`
            SELECT d.*, dv.distributionDate, dv.calcMethod, dv.note 
            FROM dividend_distributions d
            JOIN dividends dv ON d.dividendId = dv.id
            WHERE d.memberId = ?
            ORDER BY dv.distributionDate DESC
        `, [req.member.id]);
        res.json({ dividends });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dividends/:id/receipt.pdf', memberAuthRequired, async (req, res) => {
    try {
        const dist = await dbGet(`
            SELECT d.*, dv.distributionDate, dv.calcMethod, dv.note 
            FROM dividend_distributions d
            JOIN dividends dv ON d.dividendId = dv.id
            WHERE d.id = ? AND d.memberId = ?
        `, [req.params.id, req.member.id]);

        if (!dist) return res.status(404).json({ error: 'Dividend distribution record not found.' });

        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.member.id]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Dividend_Receipt_${dist.dividendId}.pdf"`);

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(res);

        await drawReportHeader(doc, 'Dividend Payout Receipt');

        // Receipt Content
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text('PAYOUT CONFIRMATION', 50, doc.y + 20);
        doc.rect(50, doc.y + 5, 495, 1).fill('#e2e8f0');
        doc.moveDown(1.5);

        const startY = doc.y;
        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Recipient:');
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text(member.name);
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`ID: ${member.membershipNumber || member.id}`);
        
        doc.y = startY;
        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Payout Date:', 350, startY);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text(new Date(dist.distributionDate).toLocaleDateString(), 350);
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Ref: DIV-${dist.dividendId}`, 350);

        doc.moveDown(3);

        // Highlight Amount
        doc.rect(50, doc.y, 495, 60).fillColor('#f8fafc').fill();
        doc.fontSize(11).font('Helvetica').fillColor('#64748b').text('CREDITED AMOUNT', 70, doc.y + 15);
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#10b981').text(`KES ${dist.amount.toLocaleString()}`, 70, doc.y + 5);

        doc.y += 40;
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Method: ${dist.calcMethod.toUpperCase()}`);
        doc.text(`Note: ${dist.note || 'Institutional Dividend Distribution'}`);
        doc.moveDown(3);

        doc.fontSize(9).font('Helvetica').fillColor('#334155').text('This amount has been credited to your Share Capital ledger and is reflected in your total savings balance.');

        drawSignatureBlock(doc, 'Institutional Treasurer', doc.y + 60);
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/notifications', memberAuthRequired, async (req, res) => {
    try {
        const notifications = await dbAll(
            "SELECT * FROM notifications WHERE userId = ? AND userType = 'member' ORDER BY timestamp DESC LIMIT 50",
            [req.member.id]
        );
        res.json({ success: true, notifications });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/passbook.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member profile not found.' });

        const [payments, loans, penalties, dividends, ledger, pots] = await Promise.all([
            dbAll('SELECT * FROM payments WHERE memberId=? AND status="completed" ORDER BY paymentDate DESC', [memberId]),
            dbAll(`SELECT l.*, COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId=l.id),0) as totalRepaid FROM loans l WHERE l.memberId=? ORDER BY l.disbursedDate DESC`, [memberId]),
            dbAll('SELECT * FROM penalties WHERE memberId=? ORDER BY issuedDate DESC', [memberId]),
            dbAll("SELECT * FROM dividends ORDER BY distributionDate DESC LIMIT 5"),
            dbAll('SELECT * FROM ledger WHERE memberId=? ORDER BY date DESC', [memberId]),
            dbAll('SELECT * FROM target_savings WHERE memberId=? AND status="active"', [memberId])
        ]);

        const totalSacco    = ledger.filter(l => ['SAVINGS', 'SHARE_CAPITAL'].includes(l.type)).reduce((s, l) => s + l.amount, 0);
        const walletBalance = ledger.filter(l => l.type === 'PERSONAL').reduce((s, l) => s + l.amount, 0);
        const inPots        = pots.reduce((s, p) => s + p.currentAmount, 0);
        
        const totalPen   = penalties.reduce((s, p) => s + p.amount, 0);
        const paidPen    = penalties.filter(p => p.paidStatus === 'paid').reduce((s, p) => s + p.amount, 0);
        const loanBal    = loans.reduce((s, l) => s + Math.max(0, l.amount - (l.totalRepaid || 0)), 0);

        const safeName   = sanitizeFilename(member.name);
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`attachment; filename="PASSBOOK_${safeName}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Digital Member Passbook');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('MEMBER IDENTITY PROFILE', 50, doc.y);
        doc.moveTo(50, doc.y + 2).lineTo(200, doc.y + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.moveDown(0.5);
        
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text(member.name.toUpperCase());
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`Membership ID: ${member.membershipNumber || 'PENDING'}`);
        doc.text(`Phone: ${member.phone} | Joined: ${new Date(member.joinDate).toLocaleDateString()}`);
        doc.moveDown(1.5);

        const startY = doc.y;
        drawSummaryCard(doc, 'SACCO Savings', `KES ${totalSacco.toLocaleString()}`, '#2563eb', 50, startY);
        drawSummaryCard(doc, 'Personal Wallet', `KES ${walletBalance.toLocaleString()}`, '#10b981', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Allocated (Pots)', `KES ${inPots.toLocaleString()}`, '#f59e0b', 50 + (153 + 15) * 2, startY);
        
        doc.y = startY + 75;

        // ── SAVING GOALS ──
        if (pots.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('ACTIVE SAVING GOALS (POTS)');
            const pCols = [
                { label: 'Goal Name', x: 60, width: 150 },
                { label: 'Target', x: 210, width: 100, align: 'right' },
                { label: 'Saved', x: 310, width: 100, align: 'right' },
                { label: 'Progress', x: 410, width: 100, align: 'right' }
            ];
            let pY = drawTableHeader(doc, pCols, doc.y + 5);
            pots.forEach(p => {
                const perc = Math.round((p.currentAmount / p.targetAmount) * 100);
                doc.fontSize(8).font('Helvetica').fillColor('#334155');
                doc.text(p.name, pCols[0].x, pY);
                doc.text(p.targetAmount.toLocaleString(), pCols[1].x, pY, { width: 100, align: 'right' });
                doc.text(p.currentAmount.toLocaleString(), pCols[2].x, pY, { width: 100, align: 'right' });
                doc.font('Helvetica-Bold').fillColor(perc >= 100 ? '#10b981' : '#334155').text(`${perc}%`, pCols[3].x, pY, { width: 100, align: 'right' });
                pY += 15;
            });
            doc.y = pY + 15;
        }

        // ── DIVIDEND HISTORY ──
        if (dividends.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('RECENT DIVIDEND DISTRIBUTIONS');
            const dCols = [
                { label: 'Date', x: 60, width: 100 },
                { label: 'Method', x: 160, width: 150 },
                { label: 'Pool Amount (KES)', x: 310, width: 180, align: 'right' }
            ];
            let dY = drawTableHeader(doc, dCols, doc.y + 5);
            dividends.forEach(d => {
                doc.fontSize(8).font('Helvetica').fillColor('#334155');
                doc.text(new Date(d.distributionDate).toLocaleDateString(), dCols[0].x, dY);
                doc.text(d.calcMethod.toUpperCase(), dCols[1].x, dY);
                doc.font('Helvetica-Bold').text(Number(d.totalPoolAmount).toLocaleString(), dCols[2].x, dY, { width: dCols[2].width, align: 'right' });
                dY += 15;
            });
            doc.y = dY + 15;
        }

        // ── TRANSACTION LEDGER ──
        if (payments.length) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('RECENT CONTRIBUTIONS & PAYMENTS');
            const cols = [
                { label: 'Date', x: 60, width: 80 },
                { label: 'Reference / Note', x: 140, width: 220 },
                { label: 'Category', x: 360, width: 100 },
                { label: 'Amount (KES)', x: 460, width: 70, align: 'right' }
            ];
            let curY = drawTableHeader(doc, cols, doc.y + 5);
            payments.slice(0, 15).forEach((p, idx) => {
                if (curY > 740) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
                if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
                doc.fontSize(8).font('Helvetica').fillColor('#334155');
                doc.text(new Date(p.paymentDate).toLocaleDateString(), cols[0].x, curY);
                doc.text(`${p.reference || 'DIRECT'} ${p.note ? `(${p.note})` : ''}`, cols[1].x, curY, { width: 215, ellipsis: true });
                doc.text((p.walletType || 'SACCO Savings').toUpperCase(), cols[2].x, curY);
                doc.font('Helvetica-Bold').fillColor('#10b981').text(Number(p.amount).toLocaleString(), cols[3].x, curY, { width: cols[3].width, align: 'right' });
                curY += 18;
            });
            doc.y = curY + 20;
        }

        await drawReportNote(doc, 'This is an official Digital Member Passbook generated by the SACCO Self-Service Portal. All balances are reflective of verified institutional records as of the date of generation.');
        drawPageFooter(doc);
        doc.end();
        logActivity('Passbook Export', 'Member', memberId, 'Self-generated Digital Passbook PDF', member.name);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', memberAuthRequired, async (req, res) => {
    const { email, phone } = req.body;
    try {
        const memberId = req.member.id;
        const updates = [];
        const params = [];

        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }

        if (phone) {
            // Check if phone is different from current
            const current = await dbGet('SELECT phone FROM members WHERE id = ?', [memberId]);
            if (current.phone !== phone) {
                updates.push('pending_phone = ?');
                params.push(phone);
            }
        }

        if (updates.length === 0) return res.json({ message: 'No changes detected.' });

        params.push(memberId);
        await dbRun(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`, params);
        
        logActivity('Profile Update', 'Member', memberId, `Updated profile info: ${updates.join(', ')}`, req.member.name);
        
        if (phone) {
            // Create a notification for admins about the phone change request
            const admins = await dbAll("SELECT id FROM admin_users WHERE role IN ('superadmin', 'secretary', 'ict_admin')");
            for (const admin of admins) {
                await createNotification(admin.id, 'admin', 'Phone Change Request', `${req.member.name} has requested to change their phone number to ${phone}.`, '/members', 'security');
            }
        }

        res.json({ message: 'Profile updated successfully. Phone changes require admin approval.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/statement.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const { start, end } = req.query;
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const dateFilter = start && end ? `AND paymentDate BETWEEN '${start}' AND '${end}'` : '';
        const payments = await dbAll(`SELECT paymentDate as date, 'Payment: ' || walletType as activity, reference, amount, 'credit' as type FROM payments WHERE memberId = ? AND status='completed' ${dateFilter}`, [memberId]);
        
        const loanFilter = start && end ? `AND paidDate BETWEEN '${start}' AND '${end}'` : '';
        const loanRepays = await dbAll(`SELECT paidDate as date, 'Loan Repayment' as activity, reference, amount, 'debit' as type FROM loan_repayments WHERE loanId IN (SELECT id FROM loans WHERE memberId = ?) ${loanFilter}`, [memberId]);
        
        const divFilter = start && end ? `AND dv.distributionDate BETWEEN '${start}' AND '${end}'` : '';
        const divs = await dbAll(`
            SELECT 
                dv.distributionDate as date, 
                'Dividend Payout' as activity, 
                'DIV-' || d.dividendId as reference, 
                d.amount, 
                'credit' as type 
            FROM dividend_distributions d
            JOIN dividends dv ON d.dividendId = dv.id
            WHERE d.memberId = ? ${divFilter}
        `, [memberId]);

        // Combine and sort
        const transactions = [...payments, ...loanRepays, ...divs].sort((a, b) => new Date(b.date) - new Date(a.date));

        const doc = new PDFDocument({ margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Statement_${member.name.replace(/ /g, '_')}.pdf`);
        doc.pipe(res);

        const periodStr = start && end ? `${start} to ${end}` : 'ALL TIME';
        await drawReportHeader(doc, 'OFFICIAL ACCOUNT STATEMENT', periodStr);

        // Member Summary Header
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text('MEMBER DETAILS', 50, doc.y);
        doc.fontSize(8).font('Helvetica').fillColor('#475569').text(`Name: ${member.name}`, 50, doc.y + 12);
        doc.text(`Phone: ${member.phone}`, 50, doc.y + 22);
        doc.text(`Email: ${member.email || 'N/A'}`, 50, doc.y + 32);
        doc.y += 50;

        // Stats Cards
        const totalCred = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
        const totalDeb = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
        const balance = totalCred - totalDeb;
        drawSummaryCard(doc, 'Total Credits', `KES ${totalCred.toLocaleString()}`, '#10b981', 50, doc.y, 160);
        drawSummaryCard(doc, 'Total Debits', `KES ${totalDeb.toLocaleString()}`, '#ef4444', 220, doc.y, 160);
        drawSummaryCard(doc, 'Closing Balance', `KES ${balance.toLocaleString()}`, balance >= 0 ? '#10b981' : '#ef4444', 390, doc.y, 160);
        doc.y += 80;

        // Table
        const cols = [
            { label: 'Date', x: 50, width: 75 },
            { label: 'Activity Description', x: 125, width: 230 },
            { label: 'Reference', x: 355, width: 95 },
            { label: 'Amount (KES)', x: 450, width: 100, align: 'right' }
        ];

        let y = drawTableHeader(doc, cols, doc.y);

        transactions.forEach(t => {
            if (y > 720) {
                doc.addPage();
                y = drawTableHeader(doc, cols, 100);
            }
            doc.fontSize(7.5).font('Helvetica').fillColor('#475569');
            
            doc.text(new Date(t.date).toLocaleDateString(), cols[0].x, y, { width: cols[0].width, characterSpacing: 0 });
            doc.text(t.activity, cols[1].x, y, { width: cols[1].width, characterSpacing: 0 });
            doc.text(t.reference || '---', cols[2].x, y, { width: cols[2].width, characterSpacing: 0 });
            
            doc.font('Helvetica-Bold').fillColor(t.type === 'credit' ? '#10b981' : '#ef4444');
            doc.text(`${t.type === 'credit' ? '+' : '-'}${t.amount.toLocaleString()}`, cols[3].x, y, { width: cols[3].width, align: 'right', characterSpacing: 0 });
            
            y += 16;
            doc.moveTo(50, y - 2).lineTo(550, y - 2).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        });

        if (transactions.length === 0) {
            doc.fontSize(10).font('Helvetica-Oblique').fillColor('#94a3b8').text('No transaction history found for the selected period.', 50, y + 20, { align: 'center', width: 500 });
        }

        drawPageFooter(doc);
        doc.end();
    } catch (err) {
        console.error('[PDF STATEMENT ERROR]', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to generate statement' });
    }
});

router.get('/loans/:id/receipt.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const loanId = req.params.id;

        const l = await dbGet(`
            SELECT l.*, m.name as memberName, m.membershipNumber, m.phone as memberPhone, m.idNumber
            FROM loans l 
            JOIN members m ON l.memberId = m.id 
            WHERE l.id = ? AND l.memberId = ?
        `, [loanId, memberId]);

        if (!l) return res.status(404).json({ error: 'Loan agreement record not found or access denied.' });

        const guarantors = await dbAll(`
            SELECT g.*, m.name as guarantorName 
            FROM loan_guarantors g 
            JOIN members m ON g.memberId = m.id 
            WHERE g.loanId = ?
        `, [l.id]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Loan_Agreement_${l.id}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Member Loan Agreement Receipt');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('BORROWER INFORMATION:');
        doc.fontSize(11).font('Helvetica').text(`${l.memberName.toUpperCase()} (#${l.membershipNumber})`);
        doc.fontSize(9).text(`ID Number: ${l.idNumber || 'N/A'}`);
        doc.fontSize(9).text(`Phone: ${l.memberPhone}`);
        doc.moveDown();

        const startY = doc.y;
        drawSummaryCard(doc, 'Principal (Loan)', `KES ${Number(l.originalPrincipal).toLocaleString()}`, '#1e293b', 50, startY, 153);
        drawSummaryCard(doc, 'Total Repayable', `KES ${Number(l.amount).toLocaleString()}`, '#2563eb', 50 + 153 + 15, startY, 153);
        drawSummaryCard(doc, 'Monthly Install', `KES ${Number(l.amount / l.tenure).toLocaleString()}`, '#10b981', 50 + (153 + 15) * 2, startY, 153);
        
        doc.y = startY + 75;
        doc.fontSize(10).font('Helvetica-Bold').text('FINANCIAL TERMS:');
        doc.fontSize(9).font('Helvetica').text(`Disbursement Date: ${new Date(l.disbursedDate).toLocaleDateString('en-GB')}`);
        doc.text(`Maturity Date: ${new Date(l.dueDate).toLocaleDateString('en-GB')}`);
        doc.text(`Loan Tenure: ${l.tenure} Months`);
        doc.text(`Interest Rate: ${l.interestRate}% (${l.repaymentMethod} basis)`);
        doc.text(`Total Interest Charged: KES ${Number(l.totalInterest).toLocaleString()}`);
        doc.moveDown();

        if (guarantors.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold').text('GUARANTOR(S):');
            guarantors.forEach(g => {
                doc.fontSize(9).font('Helvetica').text(`• ${g.guarantorName}: Committed KES ${Number(g.amount).toLocaleString()}`);
            });
            doc.moveDown();
        }

        await drawReportNote(doc, 'DECLARATION: I, the undersigned, acknowledge receipt of the loan principal and agree to the terms of repayment specified in this document. I understand that failure to remit payments by the due date may attract penalties as per the organization policy.');
        
        drawSignatureBlock(doc, 'BORROWER SIGNATURE', doc.y + 30);
        drawSignatureBlock(doc, 'AUTHORIZED BY', doc.y + 10);
        
        drawPageFooter(doc);
        doc.end();
        logActivity('Loan Receipt Export', 'Member', memberId, `Self-generated Loan Agreement PDF for ID: ${loanId}`, l.memberName);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loan-repayments/:id/receipt.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const repayId = req.params.id;

        const lr = await dbGet(`
            SELECT 
                lr.*, 
                l.amount as totalLoanWithInterest, 
                l.id as loanId,
                m.name as memberName, 
                m.membershipNumber,
                (SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id) as totalRepaidOverall
            FROM loan_repayments lr
            JOIN loans l ON lr.loanId = l.id
            JOIN members m ON l.memberId = m.id
            WHERE lr.id = ? AND l.memberId = ?
        `, [repayId, memberId]);

        if (!lr) return res.status(404).json({ error: 'Repayment record not found or access denied.' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Loan_Repayment_${lr.id}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Loan Repayment Receipt');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('TRANSACTION DETAILS:');
        doc.fontSize(9).font('Helvetica').text(`Receipt No: REPAY-${lr.id}`);
        doc.text(`Reference: ${lr.reference || 'DIRECT'}`);
        doc.text(`Payment Date: ${new Date(lr.paidDate).toLocaleString()}`);
        doc.moveDown();

        const startY = doc.y;
        drawSummaryCard(doc, 'Amount Paid', `KES ${Number(lr.amount).toLocaleString()}`, '#10b981', 50, startY, 235);
        drawSummaryCard(doc, 'Remaining Balance', `KES ${Math.max(0, lr.totalLoanWithInterest - lr.totalRepaidOverall).toLocaleString()}`, '#ef4444', 50 + 235 + 25, startY, 235);
        
        doc.y = startY + 75;
        doc.fontSize(10).font('Helvetica-Bold').text('LOAN CONTEXT:');
        doc.fontSize(9).font('Helvetica').text(`Loan ID: #${lr.loanId}`);
        doc.text(`Total Loan Value: KES ${Number(lr.totalLoanWithInterest).toLocaleString()}`);
        doc.text(`Cumulative Repayments: KES ${Number(lr.totalRepaidOverall).toLocaleString()}`);
        doc.moveDown();

        await drawReportNote(doc, 'This receipt confirms that the specified amount has been successfully applied towards your outstanding loan balance. Please keep this document for your records.');
        drawSignatureBlock(doc, 'ISSUED AUTOMATICALLY', doc.y + 40);
        drawPageFooter(doc);
        doc.end();
        logActivity('Loan Repayment Export', 'Member', memberId, `Self-generated Repayment Receipt for ID: ${repayId}`, lr.memberName);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments/:id/receipt.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const paymentId = req.params.id;

        const p = await dbGet(`
            SELECT p.*, m.name as memberName, m.membershipNumber 
            FROM payments p 
            JOIN members m ON p.memberId = m.id 
            WHERE p.id = ? AND p.memberId = ?
        `, [paymentId, memberId]);

        if (!p) return res.status(404).json({ error: 'Payment receipt not found or access denied.' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Receipt_${p.reference || p.id}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(res);

        await drawReportHeader(doc, 'Official Payment Receipt');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('PAYMENT DETAILS:');
        doc.fontSize(9).font('Helvetica').text(`Receipt No: ${p.id}`);
        doc.text(`Reference: ${p.reference || 'N/A'}`);
        doc.text(`Transaction Ref: ${p.transactionRef || 'DIRECT'}`);
        doc.text(`Date: ${new Date(p.paymentDate).toLocaleString()}`);
        doc.moveDown();

        const startY = doc.y;
        drawSummaryCard(doc, 'Amount Paid', `KES ${Number(p.amount).toLocaleString()}`, '#10b981', 50, startY, 235);
        drawSummaryCard(doc, 'Category', p.walletType.toUpperCase(), '#2563eb', 50 + 235 + 25, startY, 235);
        
        doc.y = startY + 75;
        doc.fontSize(10).font('Helvetica-Bold').text('RECIPIENT INFO:');
        doc.fontSize(9).font('Helvetica').text(`Member: ${p.memberName}`);
        doc.text(`Membership ID: ${p.membershipNumber}`);
        doc.text(`Status: ${p.status.toUpperCase()}`);
        doc.moveDown();

        await drawReportNote(doc, 'Thank you for your contribution. This receipt is a valid proof of payment for the specified category.');
        drawSignatureBlock(doc, 'SYSTEM GENERATED', doc.y + 40);
        drawPageFooter(doc);
        doc.end();
        logActivity('Payment Receipt Export', 'Member', memberId, `Self-generated Payment Receipt for ID: ${paymentId}`, p.memberName);
    } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = router;
