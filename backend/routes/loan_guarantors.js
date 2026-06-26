const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const { memberAuthRequired } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');


// --- Member: Request a Guarantor ---
router.post('/request', memberAuthRequired, async (req, res) => {
    const { loanId, guarantorMemberId } = req.body;
    if (!loanId || !guarantorMemberId) return res.status(400).json({ error: 'loanId and guarantorMemberId required.' });

    try {
        // 1. Check if loan exists and belongs to user
        const loan = await dbGet('SELECT * FROM loans WHERE id = ? AND memberId = ?', [loanId, req.member.id]);
        if (!loan) return res.status(404).json({ error: 'Loan not found or unauthorized.' });

        // 2. Check if guarantor exists
        const guarantor = await dbGet('SELECT name, phone FROM members WHERE id = ?', [guarantorMemberId]);
        if (!guarantor) return res.status(404).json({ error: 'Guarantor member not found.' });

        // 3. Upsert guarantor request
        const existing = await dbGet('SELECT id FROM loan_guarantors WHERE loanId = ? AND memberId = ?', [loanId, guarantorMemberId]);
        if (existing) return res.status(400).json({ error: 'Request already exists for this guarantor.' });

        await dbRun('INSERT INTO loan_guarantors (loanId, memberId, status, timestamp) VALUES (?, ?, ?, ?)', 
            [loanId, guarantorMemberId, 'pending', new Date().toISOString()]);

        // 4. Notify Guarantor
        const msg = `[URGENT] Hi ${guarantor.name}, ${req.member.name} has requested you to be their guarantor for a KES ${loan.amount} loan. Please log into your portal to approve or reject.`;
        try {
            await sendSMS([guarantor.phone], msg, 'guarantor_request');
        } catch (e) { console.error('Guarantor SMS failed:', e); }

        await createNotification(
            guarantorMemberId, 'member',
            'Guarantor Request 🤝',
            `${req.member.name} has requested you to be their guarantor for a KES ${Number(loan.amount).toLocaleString()} loan.`,
            '/member/portal/guarantees', 'loan'
        );

        logActivity('Guarantor Requested', 'Loan', loanId, `${req.member.name} requested ${guarantor.name} as guarantor`, req.member.name);

        res.json({ success: true, message: 'Request sent to guarantor.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Guarantor: View Pending Requests ---
router.get('/pending', memberAuthRequired, async (req, res) => {
    try {
        const requests = await dbAll(`
            SELECT g.id, g.status, g.timestamp, 
                   l.amount as loanAmount, l.id as loanId,
                   m.name as borrowerName, m.phone as borrowerPhone
            FROM loan_guarantors g
            JOIN loans l ON g.loanId = l.id
            JOIN members m ON l.memberId = m.id
            WHERE g.memberId = ? AND g.status = 'pending'
        `, [req.member.id]);
        res.json({ requests });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Guarantor: Approve/Reject Request ---
router.put('/:id/respond', memberAuthRequired, async (req, res) => {
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });

    try {
        const request = await dbGet(`
            SELECT g.*, l.memberId as borrowerId, l.amount as loanAmount
            FROM loan_guarantors g 
            JOIN loans l ON g.loanId = l.id
            WHERE g.id = ? AND g.memberId = ?
        `, [req.params.id, req.member.id]);

        if (!request) return res.status(404).json({ error: 'Request not found.' });

        await dbRun('UPDATE loan_guarantors SET status = ?, responseTimestamp = ? WHERE id = ?', 
            [status, new Date().toISOString(), req.params.id]);

        // Notify Borrower
        const borrower = await dbGet('SELECT name, phone FROM members WHERE id = ?', [request.borrowerId]);
        if (borrower) {
            const msg = `[LLUCG] Your guarantor request to ${req.member.name} has been ${status.toUpperCase()}.`;
            try {
                await sendSMS([borrower.phone], msg, 'guarantor_response');
            } catch (e) {}

            await createNotification(
                request.borrowerId, 'member',
                'Guarantor Response',
                `${req.member.name} has ${status} your guarantor request for loan #${request.loanId}.`,
                '/member/portal/loans', status === 'approved' ? 'success' : 'danger'
            );
        }

        logActivity(`Guarantor ${status}`, 'Loan', request.loanId, `${req.member.name} ${status} guarantee for ${borrower?.name || 'Member'}`);

        res.json({ success: true, message: `Request ${status}.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
