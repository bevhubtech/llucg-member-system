const express = require('express');
const router = express.Router();
const { memberAuthRequired, authRequired, financeRequired } = require('../middleware/auth');
const { triggerSTKPush, triggerB2CRequest } = require('../utils/mpesa');
const { dbGet, dbRun, normalizePhone } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { createNotification } = require('../utils/notifications');

// --- Member Initiates Payment ---
router.post('/stkpush', memberAuthRequired, async (req, res) => {
    const { phone, totalAmount, allocations } = req.body;
    
    if (!phone || !totalAmount || !allocations || !allocations.length) {
        return res.status(400).json({ error: 'Phone, totalAmount, and allocations are required.' });
    }

    try {
        const normPhone = normalizePhone(phone);
        // Ensure amount is valid
        if (totalAmount < 1) return res.status(400).json({ error: 'Amount must be at least 1 KES.' });

        const description = `SACCO Payment`;
        const reference = `MBR-${req.member.id}`;

        // Trigger STK Push
        const mpesaResponse = await triggerSTKPush(normPhone, totalAmount, reference, description);

        // mpesaResponse looks like { ResponseCode: "0", CheckoutRequestID: "ws_CO_xxx", CustomerMessage: "Success..." }
        if (mpesaResponse.ResponseCode === "0") {
            // Save to database as pending
            await dbRun(
                `INSERT INTO mpesa_transactions (memberId, amount, phone, checkoutRequestId, status, allocations) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    req.member.id, 
                    totalAmount, 
                    normPhone, 
                    mpesaResponse.CheckoutRequestID, 
                    'pending', 
                    JSON.stringify(allocations)
                ]
            );

            return res.json({ 
                message: 'STK Push sent successfully. Please enter your PIN on your phone.',
                checkoutRequestId: mpesaResponse.CheckoutRequestID
            });
        } else {
            return res.status(400).json({ error: 'Failed to trigger M-Pesa STK Push.' });
        }
    } catch (err) {
        console.error('[MPESA STK PUSH]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Frontend Polling Status ---
router.get('/status/:checkoutRequestId', memberAuthRequired, async (req, res) => {
    try {
        const tx = await dbGet('SELECT * FROM mpesa_transactions WHERE checkoutRequestId = ? AND memberId = ?', [req.params.checkoutRequestId, req.member.id]);
        if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

        res.json({ status: tx.status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Safaricom Callback Webhook (PUBLIC URL) ---
router.post('/callback', async (req, res) => {
    // Safaricom expects a 200 OK fast. We acknowledge receipt.
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    try {
        const callbackData = req.body?.Body?.stkCallback;
        if (!callbackData) {
            console.error('[MPESA CALLBACK] Invalid payload received:', JSON.stringify(req.body));
            return;
        }

        const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callbackData;

        // Fetch the pending transaction
        const tx = await dbGet('SELECT * FROM mpesa_transactions WHERE checkoutRequestId = ?', [CheckoutRequestID]);
        if (!tx) {
            console.error(`[MPESA CALLBACK] Transaction ${CheckoutRequestID} not found in DB.`);
            return;
        }

        if (tx.status !== 'pending') {
            console.log(`[MPESA CALLBACK] Transaction ${CheckoutRequestID} already processed.`);
            return;
        }

        // ResultCode 0 means success. Anything else is an error (cancelled, insufficient funds, etc).
        if (ResultCode === 0 && CallbackMetadata && CallbackMetadata.Item) {
            // Extract MpesaReceiptNumber
            const receiptItem = CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber');
            const receiptNumber = receiptItem ? receiptItem.Value : `MPESA-${Date.now()}`;

            // 1. Mark mpesa_transactions as completed
            await dbRun('UPDATE mpesa_transactions SET status = ? WHERE id = ?', ['completed', tx.id]);

            // 2. Process split allocations into the main payments table
            let allocations = [];
            try { allocations = JSON.parse(tx.allocations || '[]'); } catch (e) {}

            // Handle automatic split of 1100 into 1000 Savings and 100 Welfare Fund
            let processedAllocations = [];
            for (let alloc of allocations) {
                if ((alloc.type === 'Savings' || alloc.type === 'Share Capital' || alloc.type === 'SACCO Savings') && Number(alloc.amount) === 1100) {
                    processedAllocations.push({ type: 'Savings', amount: 1000 });
                    processedAllocations.push({ type: 'Welfare Fund', amount: 100 });
                } else {
                    processedAllocations.push(alloc);
                }
            }

            for (const split of processedAllocations) {
                // Determine walletType mapping (frontend sends user-friendly names, map to DB enum)
                let walletType = split.type || 'Share Capital'; // Fallback
                const ts = new Date().toISOString();

                await dbRun(
                    `INSERT INTO payments (memberId, amount, paymentDate, reference, note, status, walletType) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [tx.memberId, split.amount, ts, receiptNumber, `M-Pesa Auto (Split: ${split.type})`, 'completed', walletType]
                );

                await dbRun(
                    `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('credit', ?, ?, ?, ?, ?)`,
                    [split.amount, `M-Pesa Payment (${walletType})`, 'System API', ts, receiptNumber]
                );

                // Sync with Ledger
                if (walletType === 'Savings' || walletType === 'Share Capital' || walletType === 'SACCO Savings') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [tx.memberId, 'SAVINGS', split.amount, `M-Pesa Contribution`, 'mpesa', receiptNumber, ts]
                    );
                } else if (walletType === 'Personal Savings' || walletType === 'Personal') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [tx.memberId, 'PERSONAL', split.amount, `M-Pesa Deposit`, 'mpesa', receiptNumber, ts]
                    );
                } else if (walletType === 'Welfare Fund' || walletType === 'Welfare') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [tx.memberId, 'WELFARE', split.amount, `M-Pesa Welfare Contribution`, 'mpesa', receiptNumber, ts]
                    );
                } else if (walletType === 'Registration Fee') {
                    await dbRun(
                        'INSERT INTO ledger (memberId, type, amount, description, source, reference, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [tx.memberId, 'REGISTRATION', split.amount, `M-Pesa Registration Fee`, 'mpesa', receiptNumber, ts]
                    );
                    await dbRun('UPDATE members SET registration_fee_paid = 1 WHERE id = ?', [tx.memberId]);
                } else if (walletType === 'Penalty') {
                    // Update the oldest unpaid penalty
                    const oldestPenalty = await dbGet('SELECT id FROM penalties WHERE memberId = ? AND paidStatus = "unpaid" ORDER BY issuedDate ASC LIMIT 1', [tx.memberId]);
                    if (oldestPenalty) {
                        await dbRun('UPDATE penalties SET paidStatus = "paid" WHERE id = ?', [oldestPenalty.id]);
                        console.log(`[MPESA CALLBACK] Marked penalty ${oldestPenalty.id} as paid.`);
                    }
                }

                // Notify Member
                await createNotification(
                    tx.memberId, 'member',
                    'M-Pesa Payment Received',
                    `Your M-Pesa payment of KES ${Number(split.amount).toLocaleString()} for ${walletType} has been successfully credited. Receipt: ${receiptNumber}`,
                    '/member/portal/payments', 'success'
                );
            }

            logActivity('Payment Received', 'Member', tx.memberId, `M-Pesa payment of KES ${tx.amount} received (Receipt: ${receiptNumber})`, 'System API');
            console.log(`[MPESA CALLBACK] Processed successful payment for ${CheckoutRequestID} (Receipt: ${receiptNumber})`);

        } else {
            // Failed or Cancelled
            await dbRun('UPDATE mpesa_transactions SET status = ? WHERE id = ?', ['failed', tx.id]);
            console.log(`[MPESA CALLBACK] Failed transaction ${CheckoutRequestID}: ${ResultDesc}`);
        }
    } catch (err) {
        console.error('[MPESA CALLBACK] Error processing webhook:', err);
    }
});

// --- Admin Triggers B2C Disbursement ---
router.post('/b2c/disburse', authRequired, financeRequired, async (req, res) => {
    const { memberId, amount, type, referenceId, remarks } = req.body;

    if (!memberId || !amount || !type || !referenceId) {
        return res.status(400).json({ error: 'memberId, amount, type, and referenceId are required.' });
    }

    try {
        const member = await dbGet('SELECT phone, name FROM members WHERE id = ?', [memberId]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const phone = normalizePhone(member.phone);
        const b2cResponse = await triggerB2CRequest(phone, amount, 'BusinessPayment', remarks || `SACCO ${type} Payout`);

        if (b2cResponse.ResponseCode === "0") {
            await dbRun(
                `INSERT INTO mpesa_b2c_transactions (memberId, amount, phone, conversationId, originatorConversationId, status, type, referenceId, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    memberId, 
                    amount, 
                    phone, 
                    b2cResponse.ConversationID, 
                    b2cResponse.OriginatorConversationID, 
                    'pending', 
                    type, 
                    referenceId, 
                    new Date().toISOString()
                ]
            );

            logActivity('B2C Disbursement Initiated', type, referenceId, `M-Pesa B2C for KES ${amount} to ${member.name} initiated.`, req.admin.username);

            return res.json({ 
                message: 'M-Pesa B2C disbursement initiated successfully.',
                conversationId: b2cResponse.ConversationID
            });
        } else {
            return res.status(400).json({ error: b2cResponse.ResponseDescription || 'Failed to trigger M-Pesa B2C.' });
        }
    } catch (err) {
        console.error('[MPESA B2C DISBURSE]', err);
        res.status(500).json({ error: err.message });
    }
});

// --- M-Pesa B2C Result Callback ---
router.post('/b2c/callback', async (req, res) => {
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    try {
        const result = req.body?.Result;
        if (!result) return;

        const { ConversationID, ResultCode, ResultDesc, ResultParameter } = result;

        const tx = await dbGet('SELECT * FROM mpesa_b2c_transactions WHERE conversationId = ?', [ConversationID]);
        if (!tx) {
            console.error(`[MPESA B2C CALLBACK] Transaction ${ConversationID} not found.`);
            return;
        }

        if (ResultCode === 0) {
            // Success
            await dbRun('UPDATE mpesa_b2c_transactions SET status = ?, resultDesc = ? WHERE id = ?', ['completed', ResultDesc, tx.id]);

            // Update the underlying entity (loan or withdrawal)
            if (tx.type === 'loan') {
                await dbRun('UPDATE loans SET status = "active", disbursedDate = ? WHERE id = ?', [new Date().toISOString().split('T')[0], tx.referenceId]);
            } else if (tx.type === 'withdrawal') {
                await dbRun('UPDATE withdrawals SET status = "disbursed", timestamp = ? WHERE id = ?', [new Date().toISOString(), tx.referenceId]);
            }

            // Notify Member
            await createNotification(
                tx.memberId, 'member',
                'Funds Received via M-Pesa',
                `Your ${tx.type} payout of KES ${tx.amount.toLocaleString()} has been successfully disbursed to your phone.`,
                tx.type === 'loan' ? '/member/portal/loans' : '/member/portal/savings',
                'success'
            );

            console.log(`[MPESA B2C CALLBACK] Successful disbursement for ${ConversationID}`);
        } else {
            // Failed
            await dbRun('UPDATE mpesa_b2c_transactions SET status = ?, resultDesc = ? WHERE id = ?', ['failed', ResultDesc, tx.id]);
            
            if (tx.type === 'loan') {
                await dbRun('UPDATE loans SET status = "failed_disbursement" WHERE id = ?', [tx.referenceId]);
            } else if (tx.type === 'withdrawal') {
                await dbRun('UPDATE withdrawals SET status = "failed" WHERE id = ?', [tx.referenceId]);
            }

            console.log(`[MPESA B2C CALLBACK] Disbursement failed for ${ConversationID}: ${ResultDesc}`);
        }
    } catch (err) {
        console.error('[MPESA B2C CALLBACK] Error:', err);
    }
});

// --- M-Pesa B2C Timeout Callback ---
router.post('/b2c/timeout', async (req, res) => {
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    console.warn('[MPESA B2C TIMEOUT]', JSON.stringify(req.body));
});

module.exports = router;
