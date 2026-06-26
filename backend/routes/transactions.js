const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, getSystemSettings, normalizePhone, getMemberSavings, getSystemLiquidity } = require('../utils/helpers');
const { triggerB2CRequest } = require('../utils/mpesa');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const { authRequired, financeRequired, sharedAdminRequired, memberAuthRequired, sharedAuth } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const { 
    drawReportHeader, drawSummaryCard, 
    drawPageFooter, drawWatermark, 
    drawReportNote, drawSignatureBlock 
} = require('../utils/pdf');
const { createNotification } = require('../utils/notifications');

// --- Helper Functions ---

async function validateGuarantor(memberId, amount, loanMemberId) {
    if (!memberId || !amount) throw new Error('memberId and amount required.');
    if (parseInt(memberId) === parseInt(loanMemberId)) throw new Error('Member cannot guarantee their own loan.');

    const member = await dbGet('SELECT name, joinDate FROM members WHERE id=?', [memberId]);
    if (!member) throw new Error('Member not found.');

    const unpaidPen = await dbGet(`SELECT COUNT(*) as c FROM penalties WHERE memberId=? AND paidStatus='unpaid'`, [memberId]);
    if (unpaidPen.c > 0) throw new Error(`${member.name} has unpaid penalties and cannot guarantee.`);

    const settings = await getSystemSettings();
    const target = parseFloat(settings.contribution_target || 0);
    const monthsActive = Math.round((new Date() - new Date(member.joinDate)) / (1000*60*60*24*30));
    const paidRow = await dbGet(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE memberId=? AND status='completed' AND walletType NOT IN ('Registration Fee', 'Penalty', 'Welfare Fund', 'Welfare')`, [memberId]);
    if (paidRow.t < (target * monthsActive)) throw new Error(`${member.name} is in arrears and cannot guarantee.`);

    if (parseFloat(amount) > paidRow.t) throw new Error(`${member.name} can only guarantee up to KES ${paidRow.t.toLocaleString()} (their total contributions).`);
    
    return member;
}

const loanWithBalance = l => ({ 
    ...l, 
    balance: parseFloat((l.amount - (l.totalRepaid || 0)).toFixed(2)),
    repaymentProgress: l.amount > 0 ? parseFloat(((l.totalRepaid || 0) / l.amount * 100).toFixed(1)) : 0
});

// --- Payments ---

router.get('/payments', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT p.*, m.name as memberName FROM payments p JOIN members m ON p.memberId = m.id ORDER BY p.paymentDate DESC');
        res.json({ payments: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payments', authRequired, financeRequired, async (req, res) => {
        const { memberId, amount, paymentDate, reference, walletType, note, splits } = req.body;
        if (!memberId || !amount || !paymentDate) return res.status(400).json({ error: 'memberId, amount, and paymentDate required.' });

        try {
            const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
            if (!member) return res.status(404).json({ error: 'Member not found.' });

            const ref = reference || `PAY-${Date.now()}`;
            const timestamp = new Date().toISOString();
            let effectiveWalletType = walletType || (splits ? 'Multi-Fund' : 'SACCO Savings');
            let actualSplits = splits;

            // Auto-split: for any savings-type payment that matches the monthly contribution total,
            // always separate savings and welfare components into the ledger
            const settings = await getSystemSettings();
            const welfareAmt = parseFloat(settings.welfare_contribution_amount || 100);
            const savingsAmt = parseFloat(settings.contribution_target || 1000);
            const expectedMonthlyTotal = savingsAmt + welfareAmt;

            const isSavingsType = !walletType ||
                ['SACCO Savings', 'Savings', 'Monthly Contribution', 'Share Capital', 'Multi-Fund'].includes(walletType);

            if (!splits && isSavingsType && parseFloat(amount) >= expectedMonthlyTotal && (parseFloat(amount) % expectedMonthlyTotal === 0)) {
                const monthsCount = parseFloat(amount) / expectedMonthlyTotal;
                effectiveWalletType = 'Monthly Contribution';
                actualSplits = [
                    { type: 'SAVINGS', amount: savingsAmt * monthsCount, description: `Monthly Savings (${monthsCount} Month${monthsCount > 1 ? 's' : ''})` },
                    { type: 'WELFARE', amount: welfareAmt * monthsCount, description: `Monthly Welfare (${monthsCount} Month${monthsCount > 1 ? 's' : ''})` }
                ];
            }

            const r = await dbRun(
                'INSERT INTO payments (memberId, amount, paymentDate, reference, walletType, note, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [memberId, amount, paymentDate, ref, effectiveWalletType, note || '', 'completed']
            );

            // Sync with Ledger and Transactions for full audit transparency
            if (actualSplits && Array.isArray(actualSplits)) {
                for (const split of actualSplits) {
                    // 1. Log in individual member ledger
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [memberId, split.type, split.amount, `${split.description || 'Allocated Payment'}: ${note || 'Manual'}`, 'internal', ref, timestamp]
                    );

                    // 2. Log in global transactions audit trail (this is what shows in Daily/Daily/Monthly reports)
                    let fund = 'Member Savings';
                    if (split.type === 'WELFARE') fund = 'Welfare Fund';
                    if (split.type === 'REGISTRATION' || split.type === 'REG') fund = 'Institutional Reserves';

                    await dbRun(
                        `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
                        [split.amount, `${split.description || effectiveWalletType} from ${member.name}`, req.admin.username, timestamp, ref, fund]
                    );

                    if (split.type === 'REGISTRATION' || split.type === 'REG') {
                        await dbRun('UPDATE members SET registration_fee_paid = 1 WHERE id = ?', [memberId]);
                    }
                }
            } else {
                // Aggregate transaction for non-split payments
                let fund = 'Member Savings';
                if (walletType === 'Welfare Fund' || walletType === 'Welfare') fund = 'Welfare Fund';
                if (walletType === 'Registration Fee') fund = 'Institutional Reserves';
                if (walletType === 'Penalty') fund = 'Penalties/Fines';
                if (walletType === 'Personal Savings' || walletType === 'Personal') fund = 'Personal Savings';

                await dbRun(
                    `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
                    [amount, `Payment from ${member.name} (${effectiveWalletType})`, req.admin.username, timestamp, ref, fund]
                );

                if (walletType === 'Personal Savings' || walletType === 'Personal') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [memberId, 'PERSONAL', amount, `Admin Deposit: ${note || 'Manual'}`, 'internal', ref, timestamp]
                    );
                } else if (walletType === 'SACCO Savings' || walletType === 'Savings' || walletType === 'Share Capital' || walletType === 'Monthly Contribution' || walletType === 'Sacco Savings') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [memberId, 'SAVINGS', amount, `Contribution: ${note || 'Manual'}`, 'internal', ref, timestamp]
                    );
                } else if (walletType === 'Welfare Fund' || walletType === 'Welfare') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [memberId, 'WELFARE', amount, `Welfare Contribution: ${note || 'Manual'}`, 'internal', ref, timestamp]
                    );
                } else if (walletType === 'Registration Fee') {
                    await dbRun('UPDATE members SET registration_fee_paid = 1 WHERE id = ?', [memberId]);
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [memberId, 'REGISTRATION', amount, `Registration Fee: ${note || 'Manual'}`, 'internal', ref, timestamp]
                    );
                } else if (walletType === 'Penalty') {
                    // Sync with penalties table: find most recent unpaid penalty and mark it
                    const pen = await dbGet(`SELECT id FROM penalties WHERE memberId = ? AND paidStatus = 'unpaid' ORDER BY issuedDate ASC LIMIT 1`, [memberId]);
                    if (pen) {
                        await dbRun('UPDATE penalties SET paidStatus = "paid", paidDate = ? WHERE id = ?', [timestamp, pen.id]);
                    }
                    // Log in member ledger
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [memberId, 'PENALTY_PAYMENT', amount, `Penalty Fee Paid: ${note || 'Manual'}`, 'internal', ref, timestamp]
                    );
                }
            }

            logActivity('Payment Received', 'Member', memberId, `KES ${amount} via ${ref}`, req.admin.username);
            
            await createNotification(
                memberId, 'member', 
                'Payment Received', 
                `Your payment of KES ${Number(amount).toLocaleString()} (${walletType || 'Multi-Fund'}) has been recorded. Ref: ${ref}`,
                '/member/portal/payments', 'success'
            );

            res.json({ id: r.lastID, message: 'Payment recorded successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments/:id/receipt.pdf', sharedAuth, async (req, res) => {
    try {
        const p = await dbGet('SELECT p.*, m.id as memberId, m.name, m.membershipNumber FROM payments p JOIN members m ON p.memberId = m.id WHERE p.id = ?', [req.params.id]);
        if (!p) return res.status(404).json({ error: 'Payment not found.' });

        // Security check: If it's a member, it MUST be their own payment
        if (req.member && req.member.id !== p.memberId) {
            return res.status(403).json({ error: 'Access denied: You can only download your own receipts.' });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt_${p.reference}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A5', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Official Payment Receipt');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('RECEIVED FROM:');
        doc.fontSize(12).font('Helvetica').text(`${p.name.toUpperCase()} (#${p.membershipNumber})`);

        doc.moveDown();

        const startY = doc.y;
        drawSummaryCard(doc, 'Amount Paid', `KES ${Number(p.amount).toLocaleString()}`, '#10b981', 50, startY, 180);
        drawSummaryCard(doc, 'Reference', p.reference, '#1e293b', 245, startY, 180);
        
        doc.y = startY + 70;
        doc.fontSize(9).font('Helvetica-Bold').text('PAYMENT DETAILS:');
        doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(p.paymentDate).toLocaleDateString()}`);
        doc.text(`Wallet Type: ${p.walletType || 'SACCO Savings'}`);
        if (p.note) doc.text(`Notes: ${p.note}`);

        await drawReportNote(doc, 'This is a computer-generated receipt for your contribution to life-long unity capital group. Thank you for your continued commitment.');
        drawSignatureBlock(doc, 'TREASURER', doc.y + 20);
        
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a payment
router.delete('/payments/:id', authRequired, financeRequired, async (req, res) => {
    try {
        const p = await dbGet('SELECT * FROM payments WHERE id = ?', [req.params.id]);
        if (!p) return res.status(404).json({ error: 'Payment not found.' });
        await dbRun('DELETE FROM payments WHERE id = ?', [req.params.id]);
        logActivity('Payment Deleted', 'Payment', req.params.id, `Removed payment: ${p.reference} (KES ${p.amount})`, req.admin.username);
        res.json({ message: 'Payment record removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Loans ---

router.get('/loans', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT l.*, m.name as memberName, 
                   COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id), 0) as totalRepaid
            FROM loans l 
            JOIN members m ON l.memberId = m.id 
            ORDER BY l.disbursedDate DESC
        `);
        const loans = rows.map(l => ({ ...l, balance: Math.max(0, l.amount - l.totalRepaid) }));
        res.json({ loans });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loans', authRequired, financeRequired, async (req, res) => {
    const { memberId, amount, interestRate, disbursedDate, dueDate, notes, tenure, repaymentMethod, guarantors } = req.body;
    if (!memberId || !amount || !disbursedDate || !dueDate)
        return res.status(400).json({ error: 'memberId, amount, disbursedDate, dueDate required.' });
    try {
        const settings = await getSystemSettings();
        const member = await dbGet('SELECT name FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        if (guarantors && Array.isArray(guarantors)) {
            for (const g of guarantors) {
                await validateGuarantor(g.memberId, g.amount, memberId);
            }
        }

        // --- Loan Limit & Liquidity Check ---
        const memberSavings = await getMemberSavings(memberId);
        const maxBorrowable = memberSavings * 3;
        const fundingSource = req.body.fundingSource || 'Member Savings';
        const liquidity = await getSystemLiquidity(fundingSource);

        if (parseFloat(amount) > maxBorrowable) {
            throw new Error(`Loan limit exceeded. Member savings: KES ${memberSavings.toLocaleString()}. Max limit (3x): KES ${maxBorrowable.toLocaleString()}. Requested: KES ${parseFloat(amount).toLocaleString()}`);
        }

        if (parseFloat(amount) > liquidity) {
            throw new Error(`Insufficient SACCO liquidity. Available Cash: KES ${liquidity.toLocaleString()}. Requested: KES ${parseFloat(amount).toLocaleString()}`);
        }
        // -----------------------

        const principal = parseFloat(amount);
        const rate = parseFloat(interestRate || settings.default_loan_interest_rate || 0);
        const _tenure = parseInt(tenure || 1);
        const _method = repaymentMethod || settings.default_loan_interest_type || 'flat';
        const totalInterest = parseFloat((principal * (rate / 100) * _tenure).toFixed(2));
        const totalToRepay = principal + totalInterest;

        const r = await dbRun(
            'INSERT INTO loans (memberId, amount, interestRate, disbursedDate, dueDate, notes, tenure, repaymentMethod, originalPrincipal, totalInterest, fundingSource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [memberId, totalToRepay, rate, disbursedDate, dueDate, notes || '', _tenure, _method, principal, totalInterest, fundingSource || 'Member Savings']
        );
        const loanId = r.lastID;

        if (guarantors && Array.isArray(guarantors)) {
            for (const g of guarantors) {
                await dbRun('INSERT INTO loan_guarantors (loanId, memberId, amount) VALUES (?, ?, ?)', [loanId, g.memberId, g.amount]);
            }
        }

        await dbRun(
            `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('debit', ?, ?, ?, ?, ?, ?)`,
            [amount, `Loan disbursed to ${member.name}`, req.admin.username, new Date().toISOString(), `LOAN-${loanId}`, fundingSource || 'Member Savings']
        );
        logActivity('Loan Issued', 'Loan', loanId, `KES ${amount} to ${member.name}`, req.admin.username);
        res.json({ id: loanId, status: 'active' });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/loans/:id/schedule', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const loan = await dbGet('SELECT * FROM loans WHERE id = ?', [req.params.id]);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });

        const tenure = parseInt(loan.tenure || 1);
        const totalAmount = parseFloat(loan.amount);
        const monthlyPayment = totalAmount / tenure;
        const monthlyPrincipal = parseFloat(loan.originalPrincipal) / tenure;
        const monthlyInterest = parseFloat(loan.totalInterest) / tenure;
        
        const schedule = [];
        const startDate = new Date(loan.disbursedDate);
        let remainingBalance = totalAmount;

        for (let i = 1; i <= tenure; i++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(startDate.getMonth() + i);
            remainingBalance -= monthlyPayment;
            
            schedule.push({
                installment: i,
                dueDate: dueDate.toISOString(),
                payment: monthlyPayment,
                principal: monthlyPrincipal,
                interest: monthlyInterest,
                balance: Math.max(0, remainingBalance)
            });
        }

        res.json({ schedule });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loans/:id/repay', authRequired, async (req, res) => {
    const { amount, paidDate, reference } = req.body;
    if (!amount || !paidDate) return res.status(400).json({ error: 'amount and paidDate required.' });
    try {
        const loan = await dbGet('SELECT l.*, m.name as memberName FROM loans l JOIN members m ON l.memberId = m.id WHERE l.id = ?', [req.params.id]);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });

        const ref = reference || `LRP-${Date.now()}`;
        const rr = await dbRun('INSERT INTO loan_repayments (loanId, amount, paidDate, reference) VALUES (?, ?, ?, ?)', [req.params.id, amount, paidDate, ref]);
        
        const totalLoanAmount = loan.originalPrincipal + loan.totalInterest;
        const interestRatio = loan.totalInterest / totalLoanAmount;
        
        const interestPortion = amount * interestRatio;
        const principalPortion = amount - interestPortion;

        // 1. Return Principal to the original funding source
        await dbRun(
            `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
            [principalPortion, `Loan repayment (Principal) from ${loan.memberName}`, req.admin.username, new Date().toISOString(), ref, loan.fundingSource || 'Member Savings']
        );

        // 2. Redirect Interest to Interest from Loans
        await dbRun(
            `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
            [interestPortion, `Loan repayment (Interest Profit) from ${loan.memberName}`, req.admin.username, new Date().toISOString(), ref, 'Interest from Loans']
        );

        const stats = await dbGet('SELECT SUM(amount) as t FROM loan_repayments WHERE loanId = ?', [req.params.id]);
        if (stats.t >= loan.amount) await dbRun("UPDATE loans SET status = 'repaid' WHERE id = ?", [req.params.id]);

        logActivity('Loan Repayment', 'Loan', req.params.id, `Recorded KES ${amount} for ${loan.memberName}`, req.admin.username);
        res.json({ message: 'Repayment recorded.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loans/:id/repayments', authRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM loan_repayments WHERE loanId = ? ORDER BY paidDate DESC', [req.params.id]);
        res.json({ repayments: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loans/:id/receipt.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const l = await dbGet(`
            SELECT l.*, m.name as memberName, m.membershipNumber, m.phone as memberPhone, m.idNumber
            FROM loans l 
            JOIN members m ON l.memberId = m.id 
            WHERE l.id = ?
        `, [req.params.id]);
        if (!l) return res.status(404).json({ error: 'Loan not found.' });

        const guarantors = await dbAll(`
            SELECT g.*, m.name as guarantorName 
            FROM loan_guarantors g 
            JOIN members m ON g.memberId = m.id 
            WHERE g.loanId = ?
        `, [l.id]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="loan_agreement_${l.id}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Loan Agreement & Disbursement Receipt');
        
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loan-repayments/:id/receipt.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const lr = await dbGet(`
            SELECT 
                lr.*, 
                l.amount as totalLoanWithInterest, 
                l.id as loanId,
                m.name, 
                m.membershipNumber,
                (SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id) as totalRepaidOverall
            FROM loan_repayments lr
            JOIN loans l ON lr.loanId = l.id
            JOIN members m ON l.memberId = m.id
            WHERE lr.id = ?
        `, [req.params.id]);

        if (!lr) return res.status(404).json({ error: 'Repayment record not found.' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="loan_receipt_${lr.reference}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A5', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Loan Repayment Receipt');
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('MEMBER DETAILS:');
        doc.fontSize(12).font('Helvetica').text(`${lr.name.toUpperCase()} (#${lr.membershipNumber})`);
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica-Bold').text(`LOAN ID: #${lr.loanId}`);
        doc.moveDown();

        const startY = doc.y;
        drawSummaryCard(doc, 'Amount Paid', `KES ${Number(lr.amount).toLocaleString()}`, '#10b981', 50, startY, 180);
        drawSummaryCard(doc, 'Remaining Balance', `KES ${Math.max(0, lr.totalLoanWithInterest - lr.totalRepaidOverall).toLocaleString()}`, '#f43f5e', 245, startY, 180);
        
        doc.y = startY + 70;
        doc.fontSize(9).font('Helvetica-Bold').text('REPAYMENT DETAILS:');
        doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(lr.paidDate).toLocaleDateString()}`);
        doc.text(`Reference: ${lr.reference || 'N/A'}`);
        doc.text(`Total Loan Amount: KES ${Number(lr.totalLoanWithInterest).toLocaleString()}`);

        await drawReportNote(doc, 'Receipt issued by LIFE-LONG UNITY CAPITAL GROUP. This payment has been credited towards your outstanding loan balance. Verify your full statement in the member portal.');
        drawSignatureBlock(doc, 'FINANCE OFFICER', doc.y + 20);
        
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a loan guarantor
router.delete('/loans/:loanId/guarantors/:gId', authRequired, financeRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM loan_guarantors WHERE id = ?', [req.params.gId]);
        res.json({ message: 'Guarantor removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a loan
router.delete('/loans/:id', authRequired, financeRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM loan_repayments WHERE loanId = ?', [req.params.id]);
        await dbRun('DELETE FROM loan_guarantors WHERE loanId = ?', [req.params.id]);
        await dbRun('DELETE FROM loans WHERE id = ?', [req.params.id]);
        logActivity('Loan Deleted', 'Loan', req.params.id, `Removed loan and its associated records.`, req.admin.username);
        res.json({ message: 'Loan and its related records removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Loan Applications (Admin) ---

router.get('/loans/applications', authRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT 
                a.*, m.name as memberName, m.phone as memberPhone,
                COALESCE((SELECT SUM(amount) FROM ledger WHERE memberId = a.memberId AND type IN ('SAVINGS', 'SHARE_CAPITAL')), 0) as totalSavings,
                COALESCE((SELECT SUM(l.amount - (SELECT COALESCE(SUM(r.amount), 0) FROM loan_repayments r WHERE r.loanId = l.id)) 
                          FROM loans l WHERE l.memberId = a.memberId AND l.status='active'), 0) as activeDebt
            FROM loan_applications a 
            JOIN members m ON a.memberId = m.id 
            ORDER BY a.timestamp DESC
        `);
        res.json({ applications: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/loans/applications/:id/resolve', authRequired, async (req, res) => {
    const { status, reviewerNotes, interestRate } = req.body;
    try {
        const app = await dbGet('SELECT * FROM loan_applications WHERE id = ?', [req.params.id]);
        if (!app) return res.status(404).json({ error: 'Application not found.' });

        const settings = await getSystemSettings();

        await dbRun(
            'UPDATE loan_applications SET status = ?, reviewedBy = ?, reviewerNotes = ? WHERE id = ?',
            [status, req.admin.id, reviewerNotes || '', req.params.id]
        );

        if (status === 'approved') {
            // --- Loan Limit & Liquidity Check ---
            const memberSavings = await getMemberSavings(app.memberId);
            const maxBorrowable = memberSavings * 3;
            const _fund = req.body.fundingSource || 'Member Savings';
            const liquidity = await getSystemLiquidity(_fund);

            if (parseFloat(app.amount) > maxBorrowable) {
                await dbRun('UPDATE loan_applications SET status = "pending" WHERE id = ?', [req.params.id]);
                throw new Error(`Loan limit exceeded. Member savings: KES ${memberSavings.toLocaleString()}. Max limit (3x): KES ${maxBorrowable.toLocaleString()}. Requested: KES ${parseFloat(app.amount).toLocaleString()}`);
            }

            if (parseFloat(app.amount) > liquidity) {
                // Rollback status to pending if liquidity fails
                await dbRun('UPDATE loan_applications SET status = "pending" WHERE id = ?', [req.params.id]);
                throw new Error(`Insufficient SACCO liquidity. Available Cash: KES ${liquidity.toLocaleString()}. Requested: KES ${parseFloat(app.amount).toLocaleString()}`);
            }
            // -----------------------
            const principal = parseFloat(app.amount);
            const rate = parseFloat(interestRate || settings.default_loan_interest_rate || 0);
            const tenure = parseInt(app.tenure || 1);
            const _method = settings.default_loan_interest_type || 'flat';
            const totalInterest = parseFloat((principal * (rate / 100) * tenure).toFixed(2));
            const totalToRepay = principal + totalInterest;
            
            const disbursedDate = new Date().toISOString().split('T')[0];
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + tenure);
            const dueDateStr = dueDate.toISOString().split('T')[0];

            const r = await dbRun(
                'INSERT INTO loans (memberId, amount, interestRate, disbursedDate, dueDate, notes, tenure, repaymentMethod, originalPrincipal, totalInterest, status, fundingSource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [app.memberId, totalToRepay, rate, disbursedDate, dueDateStr, `Approved from application #${app.id}. ${reviewerNotes || ''}`, tenure, _method, principal, totalInterest, 'active', _fund]
            );
            
            await dbRun(
                `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('debit', ?, ?, ?, ?, ?, ?)`,
                [principal, `Loan approved for member #${app.memberId}`, req.admin.username, new Date().toISOString(), `LOAN-${r.lastID}`, _fund]
            );

            logActivity('Loan Approved & Disbursed', 'Loan', r.lastID, `KES ${principal} approved from application #${app.id}`, req.admin.username);

            // Notify Member
            await createNotification(app.memberId, 'member', 'Loan Approved 🎉', `Your loan application of KES ${Number(app.amount).toLocaleString()} has been approved. The funds are being disbursed.`, '/member/portal/loans', 'loan');

            // --- Fintech Automation: M-Pesa B2C ---
            if (req.body.automateMpesa) {
                try {
                    const member = await dbGet('SELECT phone, name FROM members WHERE id = ?', [app.memberId]);
                    const phone = normalizePhone(member.phone);
                    const b2cResponse = await triggerB2CRequest(phone, principal, 'BusinessPayment', `Loan Disb #${r.lastID}`);
                    
                    if (b2cResponse.ResponseCode === "0") {
                        await dbRun(
                            `INSERT INTO mpesa_b2c_transactions (memberId, amount, phone, conversationId, originatorConversationId, status, type, referenceId, timestamp) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [app.memberId, principal, phone, b2cResponse.ConversationID, b2cResponse.OriginatorConversationID, 'pending', 'loan', r.lastID, new Date().toISOString()]
                        );
                        logActivity('M-Pesa Disbursement Initiated', 'Loan', r.lastID, `Automated payout for Loan #${r.lastID} triggered.`, req.admin.username);
                    }
                } catch (b2cErr) {
                    console.error('[AUTO MPESA DISBURSE FAILED]', b2cErr);
                    // We don't fail the whole request, but log the error
                }
            }
        } else {
            logActivity(`Loan Application ${status}`, 'Loan Application', req.params.id, `Status set to ${status} by ${req.admin.username}`, req.admin.username);
            
            // Notify Member
            await createNotification(app.memberId, 'member', 'Loan Application Status', `Your loan application of KES ${Number(app.amount).toLocaleString()} has been ${status}. Notes: ${reviewerNotes || 'None'}`, '/member/portal/loans', 'security');
        }

        res.json({ message: `Application ${status} successfully.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/loans/applications/:id', authRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM loan_applications WHERE id = ?', [req.params.id]);
        res.json({ message: 'Application removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Penalties ---

router.get('/penalties', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT p.*, m.name as memberName FROM penalties p JOIN members m ON p.memberId = m.id ORDER BY p.issuedDate DESC');
        res.json({ penalties: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/penalties', authRequired, financeRequired, async (req, res) => {
    const { memberId, amount, reason } = req.body;
    try {
        const timestamp = new Date().toISOString();
        const r = await dbRun('INSERT INTO penalties (memberId, amount, reason, issuedDate, paidStatus) VALUES (?,?,?,?,?)',
            [memberId, amount, reason, timestamp, 'unpaid']);
        
        await createNotification(
            memberId, 'member',
            'Penalty Issued',
            `A penalty of KES ${Number(amount).toLocaleString()} has been issued for: ${reason}`,
            '/member/portal/penalties', 'danger'
        );

        logActivity('Penalty Issued', 'Penalty', r.lastID, `${reason}: KES ${amount}`, req.admin.username);
        res.json({ id: r.lastID, amount, reason });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/penalties/:id/pay', authRequired, financeRequired, async (req, res) => {
    try {
        const pen = await dbGet('SELECT * FROM penalties WHERE id = ?', [req.params.id]);
        if (!pen) return res.status(404).json({ error: 'Penalty not found' });
        
        const timestamp = new Date().toISOString();
        const dateOnly = timestamp.split('T')[0];
        const ref = `PEN-PAY-${Date.now()}`;

        // 1. Mark penalty as paid in the penalties registry
        await dbRun('UPDATE penalties SET paidStatus="paid", paidDate=? WHERE id=?', [timestamp, req.params.id]);
        
        // 2. Insert into Payments table (the source of truth for group liquidity)
        // Tagging as 'Penalty' ensures it increases Group Balance but is IGNORED by individual wealth calcs
        await dbRun(
            'INSERT INTO payments (memberId, amount, paymentDate, reference, walletType, note, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [pen.memberId, pen.amount, dateOnly, ref, 'Penalty', `Penalty Settlement: ${pen.reason}`, 'completed']
        );

        // 3. Log in Transactions audit trail
        await dbRun(
            `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
            [pen.amount, `Penalty Payment: ${pen.reason}`, req.admin.username, timestamp, ref, 'Penalties/Fines']
        );
        
        logActivity('Penalty Paid', 'Penalty', req.params.id, `KES ${pen.amount} settled`, req.admin.username);
        res.json({ message: 'Penalty marked as paid and credited to Group Capital pool.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a penalty
router.delete('/penalties/:id', authRequired, financeRequired, async (req, res) => {
    try {
        const p = await dbGet('SELECT * FROM penalties WHERE id = ?', [req.params.id]);
        if (!p) return res.status(404).json({ error: 'Penalty not found.' });
        await dbRun('DELETE FROM penalties WHERE id = ?', [req.params.id]);
        logActivity('Penalty Deleted', 'Penalty', req.params.id, `Removed penalty: ${p.reason} (KES ${p.amount})`, req.admin.username);
        res.json({ message: 'Penalty removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Pledges ---

router.get('/pledges', authRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT p.*, m.name as memberName, m.phone as memberPhone, pen.paidStatus FROM pledges p JOIN members m ON p.memberId = m.id LEFT JOIN penalties pen ON p.penaltyId = pen.id ORDER BY p.timestamp DESC');
        res.json({ pledges: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/pledges/:id/fulfill', authRequired, async (req, res) => {
    try {
        const pledge = await dbGet('SELECT * FROM pledges WHERE id = ?', [req.params.id]);
        if (!pledge) return res.status(404).json({ error: 'Pledge not found' });

        await dbRun('UPDATE pledges SET status = "fulfilled" WHERE id = ?', [req.params.id]);
        logActivity('Pledge Fulfilled', 'Pledge', req.params.id, `Member commitment marked as honored by ${req.admin.username}`);
        res.json({ message: 'Commitment marked as honored.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/pledges/:id/note', authRequired, async (req, res) => {
    try {
        const { note } = req.body;
        const pledge = await dbGet('SELECT id FROM pledges WHERE id = ?', [req.params.id]);
        if (!pledge) return res.status(404).json({ error: 'Pledge not found' });

        await dbRun('UPDATE pledges SET note = ? WHERE id = ?', [note || '', req.params.id]);
        res.json({ message: 'Transparency note updated successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/pledges/:id', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM pledges WHERE id = ?', [req.params.id]);
        logActivity('Pledge Deleted', 'Pledge', req.params.id, `Record removed by ${req.admin.username}`);
        res.json({ message: 'Pledge record removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/transactions', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 500');
        res.json({ transactions: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/transactions/:id', authRequired, financeRequired, async (req, res) => {
    try {
        const t = await dbGet('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
        if (!t) return res.status(404).json({ error: 'Transaction not found.' });
        await dbRun('DELETE FROM transactions WHERE id = ?', [req.params.id]);
        logActivity('Transaction Deleted', 'Transaction', req.params.id, `Removed entry: ${t.description} (KES ${t.amount})`, req.admin.username);
        res.json({ message: 'Transaction removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Withdrawals (Admin) ---

router.get('/withdrawals', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT w.*, m.name as memberName, m.membershipNumber 
            FROM withdrawals w
            JOIN members m ON w.memberId = m.id
            ORDER BY w.timestamp DESC
        `);
        res.json({ withdrawals: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/withdrawals/:id/resolve', authRequired, financeRequired, async (req, res) => {
    const { status, reviewerNotes, automateMpesa } = req.body;
    try {
        const w = await dbGet('SELECT * FROM withdrawals WHERE id = ?', [req.params.id]);
        if (!w) return res.status(404).json({ error: 'Withdrawal record not found.' });

        if (w.status !== 'pending') return res.status(400).json({ error: 'This withdrawal has already been processed.' });

        await dbRun(
            'UPDATE withdrawals SET status = ?, reviewerNotes = ?, reviewedBy = ? WHERE id = ?',
            [status, reviewerNotes || '', req.admin.id, req.params.id]
        );

        if (status === 'approved' || status === 'disbursed') {
            logActivity('Withdrawal Approved', 'Withdrawal', req.params.id, `Approved by ${req.admin.username}`, req.admin.username);
            
            // Record in central Treasury Transactions
            await dbRun(
                `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('debit', ?, ?, ?, ?, ?)`,
                [w.amount, `Withdrawal to member #${w.memberId} (${w.phone})`, req.admin.username, new Date().toISOString(), `WDR-${w.id}`]
            );

            if (automateMpesa) {
                try {
                    const phone = normalizePhone(w.phone);
                    const b2cResponse = await triggerB2CRequest(phone, w.amount, 'BusinessPayment', `Withdrawal #${w.id}`);
                    
                    if (b2cResponse.ResponseCode === "0") {
                        await dbRun(
                            `INSERT INTO mpesa_b2c_transactions (memberId, amount, phone, conversationId, originatorConversationId, status, type, referenceId, timestamp) 
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [w.memberId, w.amount, phone, b2cResponse.ConversationID, b2cResponse.OriginatorConversationID, 'pending', 'withdrawal', w.id, new Date().toISOString()]
                        );
                        logActivity('M-Pesa Disbursement Initiated', 'Withdrawal', w.id, `Automated payout for Withdrawal #${w.id} triggered.`, req.admin.username);
                    }
                } catch (b2cErr) {
                    console.error('[AUTO WITHDRAWAL DISBURSE FAILED]', b2cErr);
                }
            }

            await createNotification(w.memberId, 'member', 'Withdrawal Approved', `Your withdrawal of KES ${w.amount.toLocaleString()} has been approved.`, '/member/portal/savings', 'success');
        } else if (status === 'rejected') {
            // REVERSE the ledger entry
            await dbRun(
                'INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, ?, ?, ?)',
                [w.memberId, 'PERSONAL', w.amount, `Reversal: Rejected Withdrawal #${w.id}`, 'internal', new Date().toISOString()]
            );

            logActivity('Withdrawal Rejected', 'Withdrawal', req.params.id, `Rejected by ${req.admin.username}. Funds reversed.`, req.admin.username);
            await createNotification(w.memberId, 'member', 'Withdrawal Rejected', `Your withdrawal request has been rejected. Funds have been returned to your Personal Wallet. Reason: ${reviewerNotes || 'N/A'}`, '/member/portal/savings', 'danger');
        }

        res.json({ message: `Withdrawal ${status} successfully.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
