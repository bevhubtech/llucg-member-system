const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, getSystemSettings } = require('../utils/helpers');
const { authRequired, ictRequired, financeRequired } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

/**
 * Risk Scoring Logic (The "Antigravity Trust Index")
 * 
 * Factors:
 * 1. Contribution Consistency (40%): How many target contributions were met?
 * 2. Repayment Punctuality (30%): Days overdue for loan repayments.
 * 3. Membership Seniority (20%): Length of time in the system.
 * 4. Penalty History (10%): Count of behavioral penalties.
 */

async function calculateMemberScore(memberId) {
    const member = await dbGet('SELECT * FROM members WHERE id = ?', [memberId]);
    if (!member) return 0;

    const settings = await getSystemSettings();
    const target = parseFloat(settings.contribution_target || 1000);
    const joinDate = new Date(member.joinDate);
    const now = new Date();
    const monthsActive = Math.max(1, Math.round((now - joinDate) / (1000 * 60 * 60 * 24 * 30)));

    // 1. Contribution Consistency
    const payments = await dbGet("SELECT SUM(amount) as total FROM payments WHERE memberId = ? AND status = 'completed' AND walletType IN ('Savings', 'SACCO Savings', 'Share Capital')", [memberId]);
    const totalPaid = payments.total || 0;
    const expectedTotal = target * monthsActive;
    const contributionRatio = Math.min(1, totalPaid / expectedTotal);

    // 2. Repayment Punctuality
    const loans = await dbAll("SELECT id, amount, dueDate FROM loans WHERE memberId = ?", [memberId]);
    let totalLoanDaysOverdue = 0;
    let loanCount = loans.length;
    
    for (const l of loans) {
        const repayments = await dbAll("SELECT paidDate FROM loan_repayments WHERE loanId = ?", [l.id]);
        const dueDate = new Date(l.dueDate);
        repayments.forEach(r => {
            const paidDate = new Date(r.paidDate);
            if (paidDate > dueDate) {
                totalLoanDaysOverdue += Math.round((paidDate - dueDate) / (1000 * 60 * 60 * 24));
            }
        });
    }
    // Score penalty for lateness: 0-30 points. -1 point per 5 days overdue avg.
    const avgOverdue = loanCount > 0 ? totalLoanDaysOverdue / loanCount : 0;
    const punctualityScore = Math.max(0, 30 - (avgOverdue / 5));

    // 3. Seniority
    const seniorityScore = Math.min(20, monthsActive * 0.5); // Max 20 points after 40 months

    // 4. Penalties
    const penalties = await dbGet("SELECT COUNT(*) as c FROM penalties WHERE memberId = ?", [memberId]);
    const penaltyScore = Math.max(0, 10 - (penalties.c * 2)); // -2 per penalty

    const finalScore = (contributionRatio * 40) + punctualityScore + seniorityScore + penaltyScore;
    
    return {
        score: Math.round(finalScore),
        breakdown: {
            contributions: Math.round(contributionRatio * 40),
            punctuality: Math.round(punctualityScore),
            seniority: Math.round(seniorityScore),
            discipline: Math.round(penaltyScore)
        },
        metrics: {
            monthsActive,
            totalPaid,
            expectedTotal,
            avgOverdue,
            penaltyCount: penalties.c
        }
    };
}

router.get('/scores', authRequired, async (req, res) => {
    try {
        const members = await dbAll("SELECT id, name, membershipNumber, phone, status FROM members WHERE status = 'active' LIMIT 100");
        const results = [];
        for (const m of members) {
            const risk = await calculateMemberScore(m.id);
            results.push({ ...m, ...risk });
        }
        // Sort by score descending
        results.sort((a, b) => b.score - a.score);
        res.json({ members: results });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/member/:id', authRequired, async (req, res) => {
    try {
        const risk = await calculateMemberScore(req.params.id);
        res.json(risk);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Automated Risk Alerts (Critical members)
router.get('/alerts', authRequired, async (req, res) => {
    try {
        const settings = await getSystemSettings();
        const threshold = parseInt(settings.risk_alert_threshold || 40);
        
        const members = await dbAll("SELECT id, name, membershipNumber FROM members WHERE status = 'active'");
        const alerts = [];
        for (const m of members) {
            const risk = await calculateMemberScore(m.id);
            if (risk.score < threshold) {
                alerts.push({
                    memberId: m.id,
                    name: m.name,
                    membershipNumber: m.membershipNumber,
                    score: risk.score,
                    reason: risk.score < 30 ? 'CRITICAL: High risk of default' : 'WARNING: Declining trust score'
                });
            }
        }
        res.json({ alerts });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
