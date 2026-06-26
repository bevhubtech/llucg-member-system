const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { 
    dbAll, dbGet, 
    sanitizeFilename, getSystemSettings,
    getSystemLiquidity
} = require('../utils/helpers');
const { 
    drawReportHeader, drawSummaryCard, 
    drawTableHeader, drawPageFooter, 
    drawReportNote, drawWatermark,
    drawSignatureBlock
} = require('../utils/pdf');
const { authRequired, financeRequired, sharedAdminRequired } = require('../middleware/auth');

router.get('/savings-summary', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT 
                m.id, m.name, m.membershipNumber, m.phone, m.joinDate,
                COALESCE((SELECT SUM(CASE WHEN walletType = 'Monthly Contribution' THEN amount - 100 ELSE amount END) FROM payments WHERE memberId = m.id AND status = 'completed' AND (walletType IN ('SACCO Savings', 'Share Capital', 'Savings', 'Monthly Contribution', 'Sacco Savings'))), 0) as saccoTotal,
                COALESCE((SELECT SUM(amount) FROM payments WHERE memberId = m.id AND status = 'completed' AND (walletType IN ('Personal Savings', 'Personal'))), 0) as personalTotal,
                (SELECT MAX(paymentDate) FROM payments WHERE memberId = m.id AND status = 'completed') as lastPaymentDate
            FROM members m
            WHERE m.status = 'active'
            ORDER BY m.name ASC
        `);
        const [liquidity, welfareLiq, reserveLiq, personalLiq] = await Promise.all([
            getSystemLiquidity('Member Savings'),
            getSystemLiquidity('Welfare Fund'),
            getSystemLiquidity('Institutional Reserves'),
            getSystemLiquidity('Personal Savings')
        ]);
        
        const totalLiquidity = liquidity + welfareLiq + reserveLiq + personalLiq;

        const interestRes = await dbGet(`
            SELECT COALESCE(SUM(
                (SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id) * (l.totalInterest / NULLIF(l.amount, 0))
            ), 0) as t 
            FROM loans l 
            WHERE (SELECT COUNT(*) FROM loan_repayments WHERE loanId = l.id) > 0
        `);
        res.json({ 
            members: rows, 
            totalGroupBalance: totalLiquidity,
            fundBreakdown: {
                savings: liquidity,
                welfare: welfareLiq,
                reserves: reserveLiq,
                personal: personalLiq
            },
            totalInterestEarned: interestRes.t
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

router.get('/savings-summary.pdf', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT 
                m.id, 
                m.name, 
                m.phone,
                COALESCE((SELECT SUM(CASE WHEN walletType = 'Monthly Contribution' THEN amount - 100 ELSE amount END) FROM payments WHERE memberId = m.id AND status = 'completed' AND (walletType IN ('SACCO Savings', 'Share Capital', 'Savings', 'Monthly Contribution', 'Sacco Savings'))), 0) as saccoTotal,
                COALESCE((SELECT SUM(amount) FROM payments WHERE memberId = m.id AND status = 'completed' AND (walletType IN ('Personal Savings', 'Personal'))), 0) as personalTotal
            FROM members m
            WHERE m.status = 'active'
            ORDER BY m.name ASC
        `);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="savings_summary_report.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Group Savings Summary Analysis');

        const totalSacco = rows.reduce((s, m) => s + m.saccoTotal, 0);
        const totalPersonal = rows.reduce((s, m) => s + m.personalTotal, 0);
        const totalCapital = totalSacco + totalPersonal;

        const startY = doc.y;
        drawSummaryCard(doc, 'Total Group Capital', `KES ${totalCapital.toLocaleString()}`, '#1e293b', 50, startY);
        drawSummaryCard(doc, 'SACCO Shares', `KES ${totalSacco.toLocaleString()}`, '#2563eb', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Personal Savings', `KES ${totalPersonal.toLocaleString()}`, '#10b981', 50 + (153 + 15) * 2, startY);

        doc.y = startY + 75;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Member Wealth Distribution');

        const cols = [
            { label: 'Member Name', x: 50, width: 200 },
            { label: 'SACCO (KES)', x: 250, width: 100, align: 'right' },
            { label: 'Personal (KES)', x: 350, width: 100, align: 'right' },
            { label: 'Total (KES)', x: 450, width: 95, align: 'right' }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);

        rows.forEach((m, idx) => {
            if (curY > 740) {
                doc.addPage();
                curY = drawTableHeader(doc, cols, 50);
            }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();

            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(m.name, cols[0].x, curY, { width: cols[0].width });
            doc.text(m.saccoTotal.toLocaleString(), cols[1].x, curY, { width: cols[1].width, align: 'right' });
            doc.text(m.personalTotal.toLocaleString(), cols[2].x, curY, { width: cols[2].width, align: 'right' });
            doc.font('Helvetica-Bold').text((m.saccoTotal + m.personalTotal).toLocaleString(), cols[3].x, curY, { width: cols[3].width, align: 'right' });

            curY += 18;
        });

        drawSignatureBlock(doc, 'Finance Officer');
        drawPageFooter(doc);
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/loans-portfolio.pdf', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT l.*, m.name as memberName, 
                   COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id), 0) as totalRepaid
            FROM loans l 
            JOIN members m ON l.memberId = m.id 
            ORDER BY l.status ASC, l.disbursedDate DESC
        `);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="loan_portfolio_report.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Group Loan Portfolio Summary');

        const disbursed = rows.reduce((s, l) => s + l.amount, 0);
        const repaid = rows.reduce((s, l) => s + l.totalRepaid, 0);
        const outstanding = disbursed - repaid;

        const startY = doc.y;
        drawSummaryCard(doc, 'Total Disbursed', `KES ${disbursed.toLocaleString()}`, '#1e293b', 50, startY, 153);
        drawSummaryCard(doc, 'Total Repayments', `KES ${repaid.toLocaleString()}`, '#10b981', 50 + 153 + 15, startY, 153);
        drawSummaryCard(doc, 'Net Portfolio Bal', `KES ${outstanding.toLocaleString()}`, '#ef4444', 50 + (153 + 15) * 2, startY, 153);

        doc.y = startY + 75;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Loan Ledger Details');

        const cols = [
            { label: 'Member Name', x: 50, width: 170 },
            { label: 'Disbursed', x: 220, width: 80, align: 'right' },
            { label: 'Total Due', x: 300, width: 80, align: 'right' },
            { label: 'Due Date', x: 390, width: 80 },
            { label: 'Repaid', x: 470, width: 80, align: 'right' },
            { label: 'Balance', x: 550, width: 80, align: 'right' },
            { label: 'Status', x: 640, width: 70 }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);
        const today = new Date().toISOString().split('T')[0];

        rows.forEach((l, idx) => {
            if (curY > 500) {
                doc.addPage();
                curY = drawTableHeader(doc, cols, 50);
            }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 650, 18).fillColor('#f8fafc').fill();

            const balance = Math.max(0, l.amount - l.totalRepaid);
            const isOverdue = l.status === 'active' && l.dueDate < today;

            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(l.memberName, cols[0].x, curY, { width: cols[0].width });
            doc.text((l.originalPrincipal || l.amount).toLocaleString(), cols[1].x, curY, { width: cols[1].width, align: 'right' });
            doc.text(l.amount.toLocaleString(), cols[2].x, curY, { width: cols[2].width, align: 'right' });
            doc.text(new Date(l.dueDate).toLocaleDateString('en-GB'), cols[3].x, curY);
            doc.text(l.totalRepaid.toLocaleString(), cols[4].x, curY, { width: cols[4].width, align: 'right' });
            
            doc.font('Helvetica-Bold').fillColor(isOverdue ? '#ef4444' : '#334155');
            doc.text(balance.toLocaleString(), cols[5].x, curY, { width: cols[5].width, align: 'right' });
            
            doc.fillColor(l.status === 'repaid' ? '#10b981' : isOverdue ? '#ef4444' : '#3b82f6');
            doc.text(isOverdue ? 'OVERDUE' : l.status.toUpperCase(), cols[6].x, curY);

            curY += 18;
        });

        drawSignatureBlock(doc, 'Finance Secretary');
        drawPageFooter(doc);
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/loans-portfolio.csv', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT l.*, m.name as memberName, m.membershipNumber,
                   COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id), 0) as totalRepaid
            FROM loans l 
            JOIN members m ON l.memberId = m.id 
            ORDER BY l.disbursedDate DESC
        `);

        let csv = 'Loan ID,Member Name,Member Number,Principal,Interest,Total Repayable,Repaid,Balance,Due Date,Status\n';
        rows.forEach(l => {
            const balance = l.amount - l.totalRepaid;
            csv += [
                l.id,
                `"${l.memberName}"`,
                `"${l.membershipNumber}"`,
                l.originalPrincipal || l.amount,
                l.totalInterest || 0,
                l.amount,
                l.totalRepaid,
                balance,
                l.dueDate,
                l.status
            ].join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="loan_portfolio.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/monthly', authRequired, financeRequired, async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const rows = await dbAll(`
            SELECT strftime('%Y-%m', timestamp) as month, 
                   SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as credits,
                   SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) as debits
            FROM transactions 
            WHERE timestamp >= date('now', '-${months} months')
            GROUP BY month ORDER BY month ASC
        `);
        res.json({ months: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/daily', authRequired, financeRequired, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const rows = await dbAll(`
            SELECT date(timestamp) as day, 
                   SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as credits,
                   SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) as debits
            FROM transactions 
            WHERE timestamp >= date('now', '-${days} days')
            GROUP BY day ORDER BY day ASC
        `);
        res.json({ daily: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/weekly', authRequired, financeRequired, async (req, res) => {
    try {
        const weeks = parseInt(req.query.weeks) || 12;
        const rows = await dbAll(`
            SELECT strftime('%Y-W%W', timestamp) as week, 
                   SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as credits,
                   SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) as debits
            FROM transactions 
            WHERE timestamp >= date('now', '-${weeks * 7} days')
            GROUP BY week ORDER BY week ASC
        `);
        res.json({ weekly: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/weekly.pdf', authRequired, financeRequired, async (req, res) => {
    try {
        const weeks = parseInt(req.query.weeks) || 12;
        const rows = await dbAll(`
            SELECT week, SUM(credits) as credits, SUM(debits) as debits
            FROM (
                SELECT strftime('%Y-W%W', timestamp) as week,
                       CASE WHEN type='credit' THEN amount ELSE 0 END as credits,
                       CASE WHEN type='debit' THEN amount ELSE 0 END as debits
                FROM transactions
                WHERE timestamp >= date('now', '-${weeks * 7} days')
            ) t GROUP BY week ORDER BY week ASC
        `);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="weekly_report_${new Date().toISOString().split('T')[0]}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Weekly Financial Inflow & Outflow Analysis');

        const totalIn = rows.reduce((s, r) => s + r.credits, 0);
        const totalOut = rows.reduce((s, r) => s + r.debits, 0);

        const startY = doc.y;
        drawSummaryCard(doc, 'Total Inflow (12W)', `KES ${totalIn.toLocaleString()}`, '#10b981', 50, startY);
        drawSummaryCard(doc, 'Total Outflow (12W)', `KES ${totalOut.toLocaleString()}`, '#ef4444', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Net Performance', `KES ${(totalIn - totalOut).toLocaleString()}`, (totalIn - totalOut) >= 0 ? '#10b981' : '#ef4444', 50 + (153 + 15) * 2, startY);

        doc.y = startY + 75;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Weekly Performance Ledger');

        const cols = [
            { label: 'Week Reference', x: 50, width: 200 },
            { label: 'Total Inflow (Credits)', x: 260, width: 150, align: 'right' },
            { label: 'Total Outflow (Debits)', x: 420, width: 150, align: 'right' },
            { label: 'Net Performance', x: 580, width: 150, align: 'right' }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);
        [...rows].reverse().forEach((r, idx) => {
            if (curY > 520) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 740, 18).fillColor('#f8fafc').fill();
            const net = r.credits - r.debits;
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(r.week, cols[0].x, curY);
            doc.text(r.credits.toLocaleString(), cols[1].x, curY, { width: 110, align: 'right' });
            doc.text(r.debits.toLocaleString(), cols[2].x, curY, { width: 110, align: 'right' });
            doc.font('Helvetica-Bold').fillColor(net >= 0 ? '#10b981' : '#ef4444').text(net.toLocaleString(), cols[3].x, curY, { width: 125, align: 'right' });
            curY += 18;
        });

        // --- Itemized Transaction Log ---
        doc.y = curY + 30;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Detailed Itemized Transaction Ledger (Last 12 Weeks)');
        doc.moveDown(0.5);

        const detCols = [
            { label: 'Date', x: 50, width: 80 },
            { label: 'Description', x: 140, width: 440 },
            { label: 'Type', x: 590, width: 70 },
            { label: 'Amount (KES)', x: 670, width: 120, align: 'right' }
        ];

        let detY = drawTableHeader(doc, detCols, doc.y);
        const allDetails = await dbAll(`
            SELECT timestamp, description, type, amount 
            FROM transactions 
            WHERE timestamp >= date('now', '-${weeks * 7} days')
            ORDER BY timestamp DESC
        `);

        if (allDetails.length === 0) {
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#94a3b8').text('No detailed transactions found for this period.', 50, detY + 10);
            detY += 30;
        } else {
            allDetails.forEach((d, idx) => {
                if (detY > 520) { doc.addPage(); detY = drawTableHeader(doc, detCols, 50); }
                if (idx % 2 === 1) doc.rect(50, detY - 2, 740, 18).fillColor('#f8fafc').fill();
                doc.fontSize(8).font('Helvetica').fillColor('#334155');
                doc.text(new Date(d.timestamp).toLocaleDateString('en-GB'), detCols[0].x, detY);
                doc.text(d.description, detCols[1].x, detY, { width: detCols[1].width });
                doc.font('Helvetica-Bold').fillColor(d.type === 'credit' ? '#10b981' : '#ef4444').text(d.type.toUpperCase(), detCols[2].x, detY);
                doc.fillColor('#1e293b').text(d.amount.toLocaleString(), detCols[3].x, detY, { width: detCols[3].width, align: 'right' });
                detY += 18;
            });
        }

        doc.y = detY + 20;
        drawSignatureBlock(doc, 'Finance Secretary');
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});


router.get('/trends', authRequired, financeRequired, async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const [contribs, expenses, memberGrowth] = await Promise.all([
            dbAll(`SELECT strftime('%Y-%m', paymentDate) as month, SUM(amount) as total FROM payments WHERE status='completed' AND paymentDate >= date('now', '-${months} months') GROUP BY month ORDER BY month ASC`),
            dbAll(`SELECT strftime('%Y-%m', expenseDate) as month, SUM(amount) as total FROM expenses WHERE expenseDate >= date('now', '-${months} months') GROUP BY month ORDER BY month ASC`),
            dbAll(`SELECT strftime('%Y-%m', joinDate) as month, COUNT(*) as count FROM members WHERE joinDate >= date('now', '-${months} months') GROUP BY month ORDER BY month ASC`),
        ]);
        res.json({ contributions: contribs, expenses, memberGrowth });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/expense-breakdown', authRequired, financeRequired, async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        const breakdown = await dbAll(`SELECT category, strftime('%Y-%m', expenseDate) as month, SUM(amount) as total FROM expenses WHERE expenseDate >= date('now', '-${months} months') GROUP BY category, month ORDER BY month ASC, category ASC`);
        const categories = [...new Set(breakdown.map(b => b.category))];
        res.json({ breakdown, categories });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loan-health', authRequired, financeRequired, async (req, res) => {
    try {
        const [total, active, repaid, defaulted, activeLoans] = await Promise.all([
            dbGet('SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM loans'),
            dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM loans WHERE status='active'`),
            dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM loans WHERE status='repaid'`),
            dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM loans WHERE status='defaulted'`),
            dbAll(`SELECT l.*, COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId=l.id),0) as totalRepaid FROM loans l WHERE l.status='active'`),
        ]);
        const overdueLoans = activeLoans.filter(l => new Date(l.dueDate) < new Date());
        const totalOutstanding = activeLoans.reduce((s, l) => s + (l.amount - l.totalRepaid), 0);
        const arrearsAmount = overdueLoans.reduce((s, l) => s + (l.amount - l.totalRepaid), 0);
        const par = totalOutstanding > 0 ? Math.round((arrearsAmount / totalOutstanding) * 100) : 0;
        const collectionRate = active.t > 0 ? Math.round((activeLoans.reduce((s,l) => s + l.totalRepaid, 0) / active.t) * 100) : 0;
        res.json({
            total: total.c, totalDisbursed: total.t,
            active: active.c, activeDisbursed: active.t,
            repaid: repaid.c, repaidAmount: repaid.t,
            defaulted: defaulted.c, defaultedAmount: defaulted.t,
            overdueCount: overdueLoans.length,
            totalOutstanding, arrearsAmount, par, collectionRate
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/forecast', authRequired, financeRequired, async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        const [activeMembers, targetRow, avgExpenses] = await Promise.all([
            dbGet(`SELECT COUNT(*) as c FROM members WHERE status='active'`),
            dbGet(`SELECT value FROM settings WHERE key='contribution_target'`),
            dbGet(`SELECT COALESCE(AVG(monthly),0) as avg FROM (SELECT strftime('%Y-%m', expenseDate) as month, SUM(amount) as monthly FROM expenses GROUP BY month)`),
        ]);
        const monthlyTarget = (parseFloat(targetRow?.value || 0)) * activeMembers.c;
        const forecast = [];
        for (let i = 1; i <= months; i++) {
            const d = new Date(); d.setMonth(d.getMonth() + i);
            forecast.push({
                month: d.toISOString().substring(0, 7),
                expectedIncome: monthlyTarget,
                expectedExpenses: Math.round(avgExpenses.avg),
                netCashFlow: monthlyTarget - Math.round(avgExpenses.avg),
            });
        }
        res.json({ forecast, activeMembers: activeMembers.c, monthlyTarget, avgMonthlyExpenses: Math.round(avgExpenses.avg) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/annual.pdf', authRequired, financeRequired, async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear().toString();
        const txs = await dbAll(`
            SELECT type, amount FROM transactions WHERE strftime('%Y', timestamp) = ?
        `, [year]);
        
        const totalIn = txs.filter(t => t.type === 'credit').reduce((s, p) => s + p.amount, 0);
        const totalOut = txs.filter(t => t.type === 'debit').reduce((s, e) => s + e.amount, 0);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="annual_report_${year}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);
        await drawReportHeader(doc, `Annual Financial Report — ${year}`);
        
        const startY = doc.y;
        drawSummaryCard(doc, 'Total Annual Income', `KES ${totalIn.toLocaleString()}`, '#10b981', 50, startY);
        drawSummaryCard(doc, 'Total Annual Expenses', `KES ${totalOut.toLocaleString()}`, '#f43f5e', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Net Annual Surplus', `KES ${(totalIn - totalOut).toLocaleString()}`, (totalIn - totalOut) >= 0 ? '#10b981' : '#f43f5e', 50 + (153 + 15) * 2, startY);

        doc.y = startY + 85;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Monthly Financial Performance Breakdown');

        const mCols = [
            { label: 'Month', x: 50, width: 150 },
            { label: 'Total In (KES)', x: 200, width: 110, align: 'right' },
            { label: 'Total Out (KES)', x: 310, width: 110, align: 'right' },
            { label: 'Net Surplus', x: 420, width: 125, align: 'right' }
        ];

        let mY = drawTableHeader(doc, mCols, doc.y + 10);
        
        const monthly = await dbAll(`
            SELECT strftime('%Y-%m', timestamp) as month, 
                   SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) as credits,
                   SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) as debits
            FROM transactions 
            WHERE strftime('%Y', timestamp) = ?
            GROUP BY month ORDER BY month ASC
        `, [year]);

        monthly.forEach((m, idx) => {
            if (mY > 740) { doc.addPage(); mY = drawTableHeader(doc, mCols, 50); }
            if (idx % 2 === 1) doc.rect(50, mY - 2, 495, 18).fillColor('#f8fafc').fill();
            const net = m.credits - m.debits;
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(new Date(m.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), mCols[0].x, mY);
            doc.text(m.credits.toLocaleString(), mCols[1].x, mY, { width: 110, align: 'right' });
            doc.text(m.debits.toLocaleString(), mCols[2].x, mY, { width: 110, align: 'right' });
            doc.font('Helvetica-Bold').fillColor(net >= 0 ? '#10b981' : '#ef4444').text(net.toLocaleString(), mCols[3].x, mY, { width: 125, align: 'right' });
            mY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/monthly.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().substring(0, 7);
        const txs = await dbAll(`
            SELECT type, amount, timestamp, description FROM transactions WHERE strftime('%Y-%m', timestamp) = ?
        `, [month]);

        const totalIn = txs.filter(t => t.type === 'credit').reduce((s, p) => s + p.amount, 0);
        const totalOut = txs.filter(t => t.type === 'debit').reduce((s, e) => s + e.amount, 0);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="monthly_report_${month}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        const monthStr = new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        await drawReportHeader(doc, `Monthly Financial Statement`, monthStr);
        
        const startY = doc.y;
        drawSummaryCard(doc, 'Total Inflow', `KES ${totalIn.toLocaleString()}`, '#10b981', 50, startY);
        drawSummaryCard(doc, 'Total Outflow', `KES ${totalOut.toLocaleString()}`, '#f43f5e', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Monthly Net', `KES ${(totalIn - totalOut).toLocaleString()}`, (totalIn - totalOut) >= 0 ? '#10b981' : '#f43f5e', 50 + (153 + 15) * 2, startY);
        
        doc.y = startY + 85;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text(`Itemized Transactions for ${monthStr}`);

        const detCols = [
            { label: 'Date', x: 50, width: 80 },
            { label: 'Time', x: 135, width: 70 },
            { label: 'Full Transaction Description', x: 210, width: 330 },
            { label: 'Type', x: 550, width: 70 },
            { label: 'Amount (KES)', x: 630, width: 150, align: 'right' }
        ];

        let detY = drawTableHeader(doc, detCols, doc.y + 10);
        txs.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach((t, idx) => {
            if (detY > 520) { doc.addPage(); detY = drawTableHeader(doc, detCols, 50); }
            if (idx % 2 === 1) doc.rect(50, detY - 2, 740, 18).fillColor('#f8fafc').fill();
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(new Date(t.timestamp).toLocaleDateString('en-GB'), detCols[0].x, detY);
            doc.text(new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), detCols[1].x, detY);
            doc.text(t.description, detCols[2].x, detY, { width: detCols[2].width });
            doc.font('Helvetica-Bold').fillColor(t.type === 'credit' ? '#10b981' : '#ef4444').text(t.type.toUpperCase(), detCols[3].x, detY);
            doc.fillColor('#1e293b').text(t.amount.toLocaleString(), detCols[4].x, detY, { width: detCols[4].width, align: 'right' });
            detY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/daily.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const txs = await dbAll(`
            SELECT type, amount, timestamp, description FROM transactions WHERE date(timestamp) = ?
        `, [date]);

        const totalIn = txs.filter(t => t.type === 'credit').reduce((s, p) => s + p.amount, 0);
        const totalOut = txs.filter(t => t.type === 'debit').reduce((s, e) => s + e.amount, 0);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="daily_report_${date}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        const dayStr = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        await drawReportHeader(doc, `Daily Financial Summary`, dayStr);
        
        const startY = doc.y;
        drawSummaryCard(doc, 'Total Inflow', `KES ${totalIn.toLocaleString()}`, '#10b981', 50, startY);
        drawSummaryCard(doc, 'Total Outflow', `KES ${totalOut.toLocaleString()}`, '#f43f5e', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Daily Net', `KES ${(totalIn - totalOut).toLocaleString()}`, (totalIn - totalOut) >= 0 ? '#10b981' : '#f43f5e', 50 + (153 + 15) * 2, startY);
        
        doc.y = startY + 85;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Itemized Daily Transactions');

        const detCols = [
            { label: 'Exact Time', x: 50, width: 100 },
            { label: 'Full Transaction Description', x: 160, width: 360 },
            { label: 'Type', x: 530, width: 80 },
            { label: 'Amount (KES)', x: 620, width: 160, align: 'right' }
        ];

        let detY = drawTableHeader(doc, detCols, doc.y + 10);
        txs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach((t, idx) => {
            if (detY > 520) { doc.addPage(); detY = drawTableHeader(doc, detCols, 50); }
            if (idx % 2 === 1) doc.rect(50, detY - 2, 740, 18).fillColor('#f8fafc').fill();
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), detCols[0].x, detY);
            doc.text(t.description, detCols[1].x, detY, { width: detCols[1].width });
            doc.font('Helvetica-Bold').fillColor(t.type === 'credit' ? '#10b981' : '#ef4444').text(t.type.toUpperCase(), detCols[2].x, detY);
            doc.fillColor('#1e293b').text(t.amount.toLocaleString(), detCols[3].x, detY, { width: detCols[3].width, align: 'right' });
            detY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/member/:id/savings.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.params.id]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        const [sacco, personal, wallet, pots] = await Promise.all([
            dbGet(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE memberId=? AND status='completed' AND walletType IN ('SACCO Savings', 'Savings', 'Share Capital')`, [member.id]),
            dbGet(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE memberId=? AND status='completed' AND walletType IN ('Personal Savings', 'Personal')`, [member.id]),
            dbGet(`SELECT COALESCE(SUM(amount),0) as t FROM ledger WHERE memberId=? AND type='PERSONAL'`, [member.id]),
            dbAll(`SELECT * FROM target_savings WHERE memberId=? AND status='active'`, [member.id])
        ]);

        const inPots = pots.reduce((s, p) => s + p.currentAmount, 0);
        const history = await dbAll(`SELECT * FROM payments WHERE memberId=? AND status='completed' ORDER BY paymentDate DESC LIMIT 50`, [member.id]);

        const safeName = sanitizeFilename(member.name);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="savings_summary_${safeName}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Savings Analysis Statement');
        doc.y = 115;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#111').text(member.name.toUpperCase());
        
        const startY = doc.y + 10;
        drawSummaryCard(doc, 'SACCO Savings', `KES ${Number(sacco.t).toLocaleString()}`, '#10b981', 50, startY, 153);
        drawSummaryCard(doc, 'Personal Wallet', `KES ${Number(wallet.t).toLocaleString()}`, '#3b82f6', 50 + 153 + 15, startY, 153);
        drawSummaryCard(doc, 'Funds in Pots', `KES ${inPots.toLocaleString()}`, '#f59e0b', 50 + (153 + 15) * 2, startY, 153);

        doc.y = startY + 75;

        if (pots.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text('ACTIVE SAVING GOALS (POTS)');
            const pCols = [
                { label: 'Goal Name', x: 60, width: 200 },
                { label: 'Target', x: 260, width: 100, align: 'right' },
                { label: 'Saved', x: 360, width: 100, align: 'right' },
                { label: 'Status', x: 460, width: 80, align: 'right' }
            ];
            let pY = drawTableHeader(doc, pCols, doc.y + 5);
            pots.forEach(p => {
                const perc = Math.round((p.currentAmount / p.targetAmount) * 100);
                doc.fontSize(8).font('Helvetica').fillColor('#334155');
                doc.text(p.name, pCols[0].x, pY);
                doc.text(p.targetAmount.toLocaleString(), pCols[1].x, pY, { width: 100, align: 'right' });
                doc.text(p.currentAmount.toLocaleString(), pCols[2].x, pY, { width: 100, align: 'right' });
                doc.text(`${perc}%`, pCols[3].x, pY, { width: 80, align: 'right' });
                pY += 15;
            });
            doc.y = pY + 20;
        }

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', authRequired, async (req, res) => {
    try {
        const [members, overdue, payments, expenses, loans, pen, investments, balanceRow] = await Promise.all([
            dbGet("SELECT COUNT(*) as c FROM members WHERE status='active'"),
            dbGet("SELECT COUNT(*) as c FROM loans WHERE status='active' AND dueDate < date('now')"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE status='completed' AND strftime('%m', paymentDate) = strftime('%m', 'now')"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE strftime('%m', expenseDate) = strftime('%m', 'now')"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM loans WHERE status='active'"),
            dbGet("SELECT COUNT(*) as c FROM penalties WHERE paidStatus='unpaid'"),
            dbGet("SELECT COALESCE(SUM(currentValue),0) as t FROM investments WHERE status='active'"),
            dbGet(`
                SELECT (
                    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='completed') - 
                    (SELECT COALESCE(SUM(amount),0) FROM expenses) -
                    (SELECT COALESCE(SUM(amount),0) FROM loans WHERE status IN ('active','defaulted')) +
                    (SELECT COALESCE(SUM(amount),0) FROM loan_repayments)
                ) as bal
            `),
        ]);
        
        const settings = await getSystemSettings();
        const target = parseFloat(settings.contribution_target || 0) * members.c;
        const collectionRate = target > 0 ? Math.round((payments.t / target) * 100) : 0;
        
        const topContributors = await dbAll(`
            SELECT m.name, SUM(p.amount) as total 
            FROM payments p JOIN members m ON p.memberId = m.id 
            WHERE p.status='completed' 
            GROUP BY m.id ORDER BY total DESC LIMIT 5
        `);

        res.json({
            totalMembers: members.c,
            overdueMembers: overdue.c,
            totalCredits: payments.t,
            totalDebits: expenses.t,
            balance: balanceRow.bal,
            outstandingLoans: loans.t,
            unpaidPenalties: pen.c,
            monthlyTarget: target,
            totalInvestments: investments.t,
            groupNetWorth: (balanceRow.bal || 0) + (investments.t || 0),
            collectionRate,
            topContributors: topContributors || [],
            overdueTrend: 0
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/dashboard', authRequired, async (req, res) => {
    try {
        const [
            members, activeLoans, pendingApps, totalSavings, 
            totalLedger, loanStats, repaymentStats, personalSavings,
            interestStats
        ] = await Promise.all([
            dbGet("SELECT COUNT(*) as c FROM members WHERE status != 'closed'"),
            dbGet("SELECT COUNT(*) as c FROM loans WHERE status='active'"),
            dbGet("SELECT COUNT(*) as c FROM loan_applications WHERE status='pending'"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE status='completed' AND walletType NOT IN ('Registration Fee', 'Penalty', 'Welfare Fund', 'Welfare', 'Personal Savings', 'Personal')"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM ledger WHERE type='SHARE_CAPITAL'"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM loans"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM loan_repayments"),
            dbGet("SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE status='completed' AND walletType IN ('Personal Savings', 'Personal')"),
            dbGet(`
                SELECT COALESCE(SUM(
                    (SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id) * (l.totalInterest / l.amount)
                ), 0) as t 
                FROM loans l 
                WHERE (SELECT COUNT(*) FROM loan_repayments WHERE loanId = l.id) > 0
            `)
        ]);

        const systemLiquidity = await getSystemLiquidity();

        // Calculate breakdown for every major fund
        const funds = [
            'Penalties/Fines',
            'Welfare Fund',
            'Interest from Loans',
            'Investment Profits',
            'Institutional Reserves',
            'Member Savings',
            'Personal Savings'
        ];

        const fundBreakdown = await Promise.all(funds.map(async (name) => {
            const balance = await getSystemLiquidity(name);
            return { name, balance };
        }));

        const paymentTrends = await dbAll(`
            SELECT strftime('%Y-%m', paymentDate) as month, SUM(amount) as total 
            FROM payments WHERE status='completed' AND paymentDate >= date('now', '-6 months') 
            GROUP BY month ORDER BY month ASC
        `);

        const pledgeStats = await dbAll("SELECT status, COUNT(*) as count FROM pledges GROUP BY status");

        res.json({
            systemTotals: {
                members: members.c,
                activeLoans: activeLoans.c,
                pendingApps: pendingApps.c,
                totalCapital: (totalSavings.t || 0) + (totalLedger.t || 0),
                totalPersonal: personalSavings.t || 0,
                totalInterest: interestStats.t || 0,
                systemLiquidity: systemLiquidity
            },
            fundBreakdown,
            totalLoanBalance: loanStats.t,
            totalRepayments: repaymentStats.t,
            paymentTrends,
            pledgeStats
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pledges-monthly', authRequired, async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        const rows = await dbAll(`
            SELECT strftime('%Y-%m', timestamp) as month, 
                   COUNT(*) as total,
                   SUM(CASE WHEN status='fulfilled' THEN 1 ELSE 0 END) as honored,
                   SUM(pledgeFee) as revenue
            FROM pledges 
            WHERE timestamp >= date('now', '-${months} months')
            GROUP BY month 
            ORDER BY month ASC
        `);
        res.json({ monthly: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/governance-funds', authRequired, financeRequired, async (req, res) => {
    try {
        const [regFees, welfare, penalties, loansDisbursed, loanRepayments, loanInterest, activeLoans] = await Promise.all([
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE status='completed' AND walletType = 'Registration Fee'"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE type='WELFARE'"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE status='completed' AND walletType = 'Penalty'"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM loans WHERE status IN ('active', 'repaid', 'defaulted')"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM loan_repayments"),
            dbGet("SELECT COALESCE(SUM(totalInterest), 0) as t FROM loans WHERE status IN ('active', 'repaid', 'defaulted')"),
            dbAll(`
                SELECT l.*, m.name as memberName, m.membershipNumber,
                       COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loanId = l.id), 0) as totalRepaid
                FROM loans l 
                JOIN members m ON l.memberId = m.id 
                WHERE l.status = 'active'
                ORDER BY l.disbursedDate DESC
            `)
        ]);
        res.json({
            registrationFees: regFees.t,
            welfareFund: welfare.t,
            penaltiesCollected: penalties.t,
            totalLoansDisbursed: loansDisbursed.t,
            totalLoanRepayments: loanRepayments.t,
            totalLoanInterest: loanInterest.t,
            activeLoans: activeLoans.map(l => ({ ...l, balance: Math.max(0, l.amount - l.totalRepaid) })),
            systemLiquidity: await getSystemLiquidity()
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ledger', authRequired, financeRequired, async (req, res) => {
    try {
        const month = req.query.month; // Expected YYYY-MM
        let query = "SELECT * FROM transactions";
        let params = [];
        
        if (month) {
            query += " WHERE strftime('%Y-%m', timestamp) = ?";
            params.push(month);
        }
        
        query += " ORDER BY timestamp DESC";
        const rows = await dbAll(query, params);
        res.json({ ledger: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/member-lifecycle-summary', authRequired, financeRequired, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT 
                m.id, m.name, m.phone, m.membershipNumber, m.joinDate, m.status, m.lifecycle_phase_override,
                COALESCE((SELECT SUM(amount) FROM payments WHERE memberId = m.id AND status = 'completed'), 0) as totalSavings,
                (SELECT MAX(paymentDate) FROM payments WHERE memberId = m.id AND status = 'completed') as lastActivity,
                (SELECT COUNT(*) FROM loans WHERE memberId = m.id AND status = 'active') as activeLoans,
                (SELECT COUNT(*) FROM withdrawals WHERE memberId = m.id AND status = 'pending') as pendingWithdrawals
            FROM members m
            ORDER BY m.name ASC
        `);

        const lifecycleData = rows.map(m => {
            const joinDate = new Date(m.joinDate);
            const monthsActive = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24 * 30));
            
            let phase = 'Active Accumulator';
            let phaseColor = 'var(--success)';

            // Priority: Manual Override
            if (m.lifecycle_phase_override) {
                phase = m.lifecycle_phase_override;
                const colors = {
                    'Onboarding': 'var(--accent)',
                    'Active Accumulator': 'var(--success)',
                    'Mature Saver': '#8b5cf6',
                    'Active Borrower': '#3b82f6',
                    'Exited / Inactive': 'var(--text-dim)',
                    'Exiting (Processing)': 'var(--warning)'
                };
                phaseColor = colors[phase] || 'var(--text-secondary)';
            } else {
                // Auto Calculation
                if (m.status === 'inactive') {
                    phase = 'Exited / Inactive';
                    phaseColor = 'var(--text-dim)';
                } else if (m.pendingWithdrawals > 0) {
                    phase = 'Exiting (Processing)';
                    phaseColor = 'var(--warning)';
                } else if (monthsActive < 3) {
                    phase = 'Onboarding';
                    phaseColor = 'var(--accent)';
                } else if (m.totalSavings > 100000) {
                    phase = 'Mature Saver';
                    phaseColor = '#8b5cf6'; // Purple
                } else if (m.activeLoans > 0) {
                    phase = 'Active Borrower';
                    phaseColor = '#3b82f6'; // Blue
                }
            }

            return { ...m, phase, phaseColor, monthsActive };
        });

        res.json({ members: lifecycleData });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/governance-funds', authRequired, financeRequired, async (req, res) => {
    try {
        const [regFees, welfare, penalties, loansDisbursed, loanRepayments, loanInterest] = await Promise.all([
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE status='completed' AND walletType = 'Registration Fee'"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE type='WELFARE'"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE status='completed' AND walletType = 'Penalty'"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM loans WHERE status IN ('active', 'repaid', 'defaulted')"),
            dbGet("SELECT COALESCE(SUM(amount), 0) as t FROM loan_repayments"),
            dbGet("SELECT COALESCE(SUM(totalInterest), 0) as t FROM loans WHERE status IN ('active', 'repaid', 'defaulted')")
        ]);

        const systemLiquidity = await getSystemLiquidity();

        res.json({
            registrationFees: regFees.t,
            welfareFund: welfare.t,
            penaltiesCollected: penalties.t,
            loansDisbursed: loansDisbursed.t,
            loanRepayments: loanRepayments.t,
            loanInterest: loanInterest.t,
            systemLiquidity
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/balance-sheet', authRequired, financeRequired, async (req, res) => {
    try {
        const funds = [
            'Penalties/Fines',
            'Welfare Fund',
            'Interest from Loans',
            'Investment Profits',
            'Institutional Reserves',
            'Member Savings',
            'Personal Savings'
        ];

        const breakdown = await Promise.all(funds.map(async (name) => {
            const balance = await getSystemLiquidity(name);
            return { name, balance };
        }));

        const totalLiquidity = breakdown.reduce((sum, f) => sum + f.balance, 0);

        res.json({
            timestamp: new Date().toISOString(),
            funds: breakdown,
            totalLiquidity
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/balance-sheet.pdf', authRequired, financeRequired, async (req, res) => {
    try {
        const funds = [
            'Institutional Reserves',
            'Welfare Fund',
            'Penalties/Fines',
            'Interest from Loans',
            'Investment Profits',
            'Member Savings',
            'Personal Savings'
        ];

        const breakdown = await Promise.all(funds.map(async (name) => {
            const balance = await getSystemLiquidity(name);
            return { name, balance };
        }));

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="institutional_balance_sheet.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Institutional Fund Balance Sheet');
        
        const totalCapital = breakdown.reduce((sum, f) => sum + f.balance, 0);
        const institutionalFunds = breakdown.filter(f => !['Member Savings', 'Personal Savings'].includes(f.name));
        const totalInstitutional = institutionalFunds.reduce((sum, f) => sum + f.balance, 0);

        const startY = doc.y;
        drawSummaryCard(doc, 'Total System Liquidity', `KES ${totalCapital.toLocaleString()}`, '#1e293b', 50, startY);
        drawSummaryCard(doc, 'Institutional Equity', `KES ${totalInstitutional.toLocaleString()}`, '#8b5cf6', 50 + 153 + 15, startY);
        drawSummaryCard(doc, 'Operational Reserves', `KES ${breakdown.find(f => f.name === 'Institutional Reserves')?.balance.toLocaleString() || '0'}`, '#10b981', 50 + (153 + 15) * 2, startY);

        doc.y = startY + 85;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Consolidated Fund Liquidity Audit');

        const cols = [
            { label: 'Fund Pool Name', x: 50, width: 300 },
            { label: 'Current Liquidity (KES)', x: 350, width: 195, align: 'right' }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);

        breakdown.forEach((f, idx) => {
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 20).fillColor('#f8fafc').fill();
            
            doc.fontSize(9).font('Helvetica').fillColor('#334155');
            doc.text(f.name, cols[0].x, curY);
            doc.font('Helvetica-Bold').text(f.balance.toLocaleString(), cols[1].x, curY, { width: cols[1].width, align: 'right' });
            
            curY += 20;
        });

        doc.y = curY + 20;
        drawReportNote(doc, "This balance sheet represents the real-time liquidity status of specific fund pools as derived from the primary transaction ledger. Discrepancies should be reconciled against individual module reports.");

        drawSignatureBlock(doc, 'ICT Administrator');
        drawPageFooter(doc);
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/balance-sheet.csv', authRequired, financeRequired, async (req, res) => {
    try {
        const funds = [
            'Penalties/Fines',
            'Welfare Fund',
            'Interest from Loans',
            'Investment Profits',
            'Institutional Reserves',
            'Member Savings',
            'Personal Savings'
        ];

        const breakdown = await Promise.all(funds.map(async (name) => {
            const balance = await getSystemLiquidity(name);
            return { name, balance };
        }));

        let csv = 'Fund Pool,Current Balance (KES),Status\n';
        breakdown.forEach(f => {
            csv += `"${f.name}",${f.balance},${f.balance > 0 ? 'LIQUID' : 'DEPLETED'}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="fund_balance_sheet.csv"');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
