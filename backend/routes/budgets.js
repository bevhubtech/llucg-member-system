const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { dbAll, dbGet, dbRun, getSystemSettings } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { drawReportHeader, drawSummaryCard, drawTableHeader, drawPageFooter, drawReportNote } = require('../utils/pdf');
const { authRequired, financeRequired, sharedAdminRequired } = require('../middleware/auth');

// --- Budgets ---

router.get('/budgets', authRequired, financeRequired, async (req, res) => {
    try {
        const period = req.query.period || new Date().toISOString().substring(0, 7);
        const budgets = await dbAll('SELECT * FROM budgets WHERE period=? ORDER BY category ASC', [period]);
        res.json({ budgets });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/budgets', authRequired, financeRequired, async (req, res) => {
    const { category, budgetedAmount, period } = req.body;
    if (!category || !budgetedAmount || !period) return res.status(400).json({ error: 'category, budgetedAmount, period required.' });
    try {
        const r = await dbRun('INSERT INTO budgets (category, budgetedAmount, period, createdBy, timestamp) VALUES (?,?,?,?,?)',
            [category, budgetedAmount, period, req.admin.username, new Date().toISOString()]);
        logActivity('Created Budget', 'Budget', r.lastID, `${category}: KES ${budgetedAmount} for ${period}`);
        res.json({ id: r.lastID, category, budgetedAmount, period });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/budgets/vs-actuals', authRequired, financeRequired, async (req, res) => {
    const period = req.query.period || new Date().toISOString().substring(0, 7);
    try {
        const budgets = await dbAll('SELECT * FROM budgets WHERE period=? ORDER BY category ASC', [period]);
        const expenses = await dbAll(`SELECT category, SUM(amount) as actual FROM expenses WHERE strftime('%Y-%m', expenseDate)=? GROUP BY category`, [period]);
        const expenseMap = {};
        expenses.forEach(e => expenseMap[e.category] = e.actual);
        const comparison = budgets.map(b => ({
            id: b.id, category: b.category, budgeted: b.budgetedAmount,
            actual: expenseMap[b.category] || 0,
            variance: b.budgetedAmount - (expenseMap[b.category] || 0),
            utilization: expenseMap[b.category] ? Math.round((expenseMap[b.category] / b.budgetedAmount) * 100) : 0,
        }));
        res.json({ period, comparison });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a budget
router.delete('/budgets/:id', authRequired, financeRequired, async (req, res) => {
    try {
        const b = await dbGet('SELECT * FROM budgets WHERE id = ?', [req.params.id]);
        if (!b) return res.status(404).json({ error: 'Budget not found.' });
        await dbRun('DELETE FROM budgets WHERE id = ?', [req.params.id]);
        logActivity('Deleted Budget', 'Budget', req.params.id, `Removed budget for ${b.category} (${b.period})`, req.admin.username);
        res.json({ message: 'Budget removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Dividend Distribution Engine ---

router.post('/dividends/declare', authRequired, financeRequired, async (req, res) => {
    const { totalProfit, periodLabel, notes } = req.body;
    if (!totalProfit || isNaN(totalProfit) || Number(totalProfit) <= 0) {
        return res.status(400).json({ error: 'A valid positive profit amount is required.' });
    }

    try {
        // 1. Get total SACCO savings pool across all active members
        const pool = await dbGet(`
            SELECT COALESCE(SUM(amount), 0) as totalSacco
            FROM ledger
            WHERE type = 'SAVINGS'
        `);
        const totalSaccoPool = pool.totalSacco || 0;
        if (totalSaccoPool <= 0) {
            return res.status(400).json({ error: 'Cannot declare dividends: no SACCO savings exist in the pool.' });
        }

        // 2. Get every member's individual SACCO savings balance
        const members = await dbAll(`
            SELECT m.id, m.name, COALESCE(SUM(l.amount), 0) as saccoBalance
            FROM members m
            LEFT JOIN ledger l ON l.memberId = m.id AND l.type = 'SAVINGS'
            WHERE m.status = 'active'
            GROUP BY m.id
            HAVING saccoBalance > 0
        `);

        if (members.length === 0) {
            return res.status(400).json({ error: 'No active members with SACCO savings found.' });
        }

        // 3. Proportionally distribute and inject into SHARE_CAPITAL ledger
        const profit = Number(totalProfit);
        const distributions = [];
        const timestamp = new Date().toISOString();
        const period = periodLabel || new Date().getFullYear().toString();

        for (const member of members) {
            const ratio = member.saccoBalance / totalSaccoPool;
            const dividend = Math.round(ratio * profit * 100) / 100; // Round to 2 decimal places
            if (dividend <= 0) continue;

            await dbRun(
                `INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    member.id,
                    'SHARE_CAPITAL',
                    dividend,
                    `Dividend Distribution — ${period}${notes ? ': ' + notes : ''}`,
                    'internal',
                    timestamp
                ]
            );

            // Also send a member notification
            await dbRun(
                `INSERT INTO member_notifications (memberId, title, message, type, createdAt)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    member.id,
                    '💰 Dividend Credit Received',
                    `Your share capital account has been credited with KES ${dividend.toLocaleString()} as a proportional dividend for the ${period} period.`,
                    'success',
                    timestamp
                ]
            ).catch(() => {}); // Non-fatal if table doesn't exist yet

            distributions.push({ memberId: member.id, name: member.name, saccoBalance: member.saccoBalance, ratio: (ratio * 100).toFixed(2) + '%', dividend });
        }

        logActivity(
            'Dividend Declared',
            'Finance',
            null,
            `KES ${profit.toLocaleString()} distributed to ${distributions.length} members for period: ${period}`,
            req.admin.username
        );

        res.json({
            message: `Dividends successfully distributed to ${distributions.length} members.`,
            totalDistributed: distributions.reduce((s, d) => s + d.dividend, 0),
            distributions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
