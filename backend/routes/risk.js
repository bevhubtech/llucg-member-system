const express = require('express');
const router = express.Router();
const { dbAll, dbGet, getSystemSettings } = require('../utils/helpers');
const { authRequired } = require('../middleware/auth');

async function getBulkRiskData(memberIds) {
    if (!memberIds || memberIds.length === 0) return {};
    
    // Convert array to comma separated string for IN clause
    const placeholders = memberIds.map(() => '?').join(',');
    
    const [payments, loans, penalties, repayments] = await Promise.all([
        dbAll(`SELECT memberId, SUM(amount) as total FROM payments WHERE status = 'completed' AND walletType IN ('Savings', 'SACCO Savings', 'Share Capital') AND memberId IN (${placeholders}) GROUP BY memberId`, memberIds),
        dbAll(`SELECT id, memberId, amount, dueDate FROM loans WHERE memberId IN (${placeholders})`, memberIds),
        dbAll(`SELECT memberId, COUNT(*) as c FROM penalties WHERE memberId IN (${placeholders}) GROUP BY memberId`, memberIds),
        dbAll(`SELECT r.loanId, r.paidDate FROM loan_repayments r JOIN loans l ON r.loanId = l.id WHERE l.memberId IN (${placeholders})`, memberIds)
    ]);

    const data = {};
    for (const id of memberIds) {
        data[id] = { totalPaid: 0, loans: [], penaltyCount: 0 };
    }

    payments.forEach(p => { if(data[p.memberId]) data[p.memberId].totalPaid = p.total; });
    penalties.forEach(p => { if(data[p.memberId]) data[p.memberId].penaltyCount = p.c; });
    
    // Map repayments by loanId
    const repsByLoan = {};
    repayments.forEach(r => {
        if (!repsByLoan[r.loanId]) repsByLoan[r.loanId] = [];
        repsByLoan[r.loanId].push(r);
    });

    loans.forEach(l => {
        l.repayments = repsByLoan[l.id] || [];
        if(data[l.memberId]) data[l.memberId].loans.push(l);
    });

    return data;
}

function calculateScoreSync(member, riskData, target) {
    const joinDate = new Date(member.joinDate);
    const now = new Date();
    const monthsActive = Math.max(1, Math.round((now - joinDate) / (1000 * 60 * 60 * 24 * 30)));

    const { totalPaid, loans, penaltyCount } = riskData;
    const expectedTotal = target * monthsActive;
    const contributionRatio = Math.min(1, totalPaid / expectedTotal);

    let totalLoanDaysOverdue = 0;
    let loanCount = loans.length;

    for (const l of loans) {
        const dueDate = new Date(l.dueDate);
        l.repayments.forEach(r => {
            const paidDate = new Date(r.paidDate);
            if (paidDate > dueDate) {
                totalLoanDaysOverdue += Math.max(0, Math.round((paidDate - dueDate) / (1000 * 60 * 60 * 24)));
            }
        });
    }

    const avgOverdue = loanCount > 0 ? totalLoanDaysOverdue / loanCount : 0;
    const punctualityScore = Math.max(0, 30 - (avgOverdue / 5));
    const seniorityScore = Math.min(20, monthsActive * 0.5);
    const penaltyScore = Math.max(0, 10 - (penaltyCount * 2));

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
            penaltyCount
        }
    };
}

router.get('/scores', authRequired, async (req, res) => {
    try {
        const settings = await getSystemSettings();
        const target = parseFloat(settings.contribution_target || 1000);
        
        const members = await dbAll("SELECT id, name, membershipNumber, phone, status, joinDate FROM members WHERE status = 'active' LIMIT 100");
        const memberIds = members.map(m => m.id);
        const riskData = await getBulkRiskData(memberIds);
        
        const results = members.map(m => {
            const risk = calculateScoreSync(m, riskData[m.id], target);
            return { ...m, ...risk };
        });
        
        results.sort((a, b) => b.score - a.score);
        res.json({ members: results });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/member/:id', authRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Not found' });
        
        const settings = await getSystemSettings();
        const target = parseFloat(settings.contribution_target || 1000);
        
        const riskData = await getBulkRiskData([member.id]);
        const risk = calculateScoreSync(member, riskData[member.id], target);
        
        res.json(risk);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/alerts', authRequired, async (req, res) => {
    try {
        const settings = await getSystemSettings();
        const threshold = parseInt(settings.risk_alert_threshold || 40);
        const target = parseFloat(settings.contribution_target || 1000);
        
        const members = await dbAll("SELECT id, name, membershipNumber, joinDate FROM members WHERE status = 'active'");
        const memberIds = members.map(m => m.id);
        const riskData = await getBulkRiskData(memberIds);
        
        const alerts = [];
        for (const m of members) {
            const risk = calculateScoreSync(m, riskData[m.id], target);
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
