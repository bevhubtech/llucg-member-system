const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { dbAll, dbGet, getMemberPhoto, getLocalIP } = require('../utils/helpers');
const { 
    drawReportHeader, drawTableHeader, drawPageFooter, 
    drawIDCardBack, drawSummaryCard 
} = require('../utils/pdf');
const { authRequired, sharedAdminRequired, memberAuthRequired } = require('../middleware/auth');

// --- CSV Helpers ---
const csvCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
};

const fmtDateCSV = (iso) => {
    if (!iso) return '---';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        // Output format: 11-Apr-2026
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    } catch (e) { return iso; }
};

// --- CSV Member Export ---
router.get('/members', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const { ids } = req.query;
        let sql = 'SELECT * FROM members';
        let params = [];
        if (ids) {
            const idList = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
            if (idList.length > 0) {
                sql += ` WHERE id IN (${idList.map(() => '?').join(',')})`;
                params = idList;
            }
        }
        sql += ' ORDER BY name ASC';
        
        const rows = await dbAll(sql, params);
        
        let csv = 'Membership Number,Full Name,Phone,Email,Join Date,Next Due Date,Status\n';
        rows.forEach(m => {
            csv += [
                csvCell(m.membershipNumber),
                csvCell(m.name),
                csvCell(m.phone),
                csvCell(m.email),
                csvCell(fmtDateCSV(m.joinDate)),
                csvCell(fmtDateCSV(m.nextDueDate)),
                csvCell(m.status ? m.status.toUpperCase() : 'UNKNOWN')
            ].join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="members_export.csv"');
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PDF Member Directory ---
router.get('/members.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const { ids } = req.query;
        let sql = 'SELECT * FROM members';
        let params = [];
        if (ids) {
            const idList = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
            if (idList.length > 0) {
                sql += ` WHERE id IN (${idList.map(() => '?').join(',')})`;
                params = idList;
            }
        }
        sql += ' ORDER BY name ASC';
        
        const members = await dbAll(sql, params);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="member_directory.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Membership Directory');
        
        const cols = [
            { label: 'ID', x: 60, width: 80 },
            { label: 'Name', x: 140, width: 150 },
            { label: 'Phone', x: 290, width: 100 },
            { label: 'Joined', x: 390, width: 80 },
            { label: 'Status', x: 470, width: 70 }
        ];

        let curY = drawTableHeader(doc, cols, doc.y);
        
        members.forEach((m, idx) => {
            if (curY > 740) {
                doc.addPage();
                curY = drawTableHeader(doc, cols, 50);
            }
            
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
            
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(m.membershipNumber || '---', cols[0].x, curY);
            doc.font('Helvetica-Bold').text(m.name, cols[1].x, curY);
            doc.font('Helvetica').text(m.phone, cols[2].x, curY);
            doc.text(new Date(m.joinDate).toLocaleDateString(), cols[3].x, curY);
            
            const statusColor = m.status === 'active' ? '#10b981' : '#f43f5e';
            doc.fillColor(statusColor).font('Helvetica-Bold').text(m.status.toUpperCase(), cols[4].x, curY);
            
            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Bulk ID Cards ---
router.get('/bulk-id-cards.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids) return res.status(400).json({ error: 'IDs required for bulk card generation.' });
        
        const idList = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
        if (idList.length === 0) return res.status(400).json({ error: 'Valid IDs required.' });

        const members = await dbAll(`SELECT * FROM members WHERE id IN (${idList.map(() => '?').join(',')})`, idList);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="bulk_id_cards.pdf"');
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        doc.pipe(res);

        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            if (i > 0 && i % 2 === 0) doc.addPage();
            
            const startY = (i % 2 === 0) ? 50 : 420;
            
            const verifyUrl = `${process.env.APP_FRONTEND_URL || `http://${getLocalIP()}:8080`}/verify/${member.membershipNumber}`;
            const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 });

            const cw = 241;
            const ch = 153;
            const gap = 20;
            const cx = (595 - (cw * 2 + gap)) / 2;

            doc.save();
            doc.roundedRect(cx, startY, cw, ch, 10).clip();
            const grad = doc.linearGradient(cx, startY, cx, startY + ch);
            grad.stop(0, '#1e293b').stop(1, '#0f172a');
            doc.rect(cx, startY, cw, ch).fill(grad);
            
            // Header Bar
            doc.rect(cx, startY, cw, 36).fill('#2563eb');
            
            // Organization Logo & Name
            const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, cx + 10, startY + 7, { width: 22, height: 22 });
            }
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('LIFE-LONG UNITY', cx + 42, startY + 8);
            doc.fillColor('#cbd5e1').font('Helvetica-Bold').fontSize(7).text('CAPITAL GROUP', cx + 42, startY + 22);

            // Member Photo
            const photoPath = await getMemberPhoto(member.id);
            if (photoPath && fs.existsSync(photoPath)) {
                doc.save();
                doc.roundedRect(cx + 12, startY + 48, 60, 75, 4).clip();
                doc.image(photoPath, cx + 12, startY + 48, { width: 60, height: 75, cover: [60, 75], align: 'center', valign: 'center' });
                doc.restore();
                doc.roundedRect(cx + 12, startY + 48, 60, 75, 4).lineWidth(1.5).stroke('#fbbf24');
            } else {
                doc.roundedRect(cx + 12, startY + 48, 60, 75, 4).fill('#475569');
                doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(8).text('NO PHOTO', cx + 12, startY + 80, { width: 60, align: 'center' });
            }

            // Member Details
            let textY = startY + 50;
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text((member.name || '').toUpperCase(), cx + 82, textY, { width: cw - 87, ellipsis: true });
            
            textY += 21;
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('MEMBER ID', cx + 82, textY);
            doc.fillColor('#fbbf24').font('Helvetica-Bold').fontSize(10).text(member.membershipNumber || '---', cx + 82, textY + 9);
            
            textY += 24;
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('JOINED', cx + 82, textY);
            const joinDate = member.joinDate ? new Date(member.joinDate).toLocaleDateString() : '---';
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(joinDate, cx + 82, textY + 9);

            // QR Code removed as requested
            
            doc.restore(); // Restore clip

            // Back
            drawIDCardBack(doc, cx + cw + gap, startY, cw, ch);
        }

        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Member Certificate (Self-Service) ---
router.get('/me/certificate.pdf', memberAuthRequired, async (req, res) => {
    try {
        const member = await dbGet('SELECT * FROM members WHERE id = ?', [req.member.id]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="certificate_${member.membershipNumber || 'member'}.pdf"`);
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(res);

        // Border
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(2).strokeColor('#1e293b').stroke();
        doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50).lineWidth(0.5).strokeColor('#94a3b8').stroke();

        await drawReportHeader(doc, 'Certificate of Membership');
        
        doc.moveDown(4);
        doc.fontSize(28).font('Times-Italic').fillColor('#1e293b').text('This is to certify that', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(36).font('Helvetica-Bold').fillColor('#2563eb').text(member.name.toUpperCase(), { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(18).font('Times-Roman').fillColor('#1e293b').text('is a duly registered and active member of the', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(22).font('Helvetica-Bold').text('LIFE-LONG UNITY CAPITAL GROUP', { align: 'center' });
        
        doc.moveDown(2);
        doc.fontSize(12).font('Helvetica').fillColor('#64748b').text(`Membership Number: ${member.membershipNumber || 'PENDING'}`, { align: 'center' });
        doc.text(`Joined on: ${new Date(member.joinDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, { align: 'center' });

        doc.moveDown(4);
        drawSignatureBlock(doc, 'Chairman', 650);
        drawSignatureBlock(doc, 'Secretary', 650); // Will position on opposite side internally or I'll customize

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Member Contribution Summary (Self-Service) ---
router.get('/me/contribution-summary.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const [member, balance, history] = await Promise.all([
            dbGet('SELECT * FROM members WHERE id = ?', [memberId]),
            dbGet(`
                SELECT 
                    SUM(CASE WHEN walletType IN ('SACCO Savings', 'Savings', 'Share Capital') THEN amount ELSE 0 END) as saccoBalance,
                    SUM(CASE WHEN walletType IN ('Personal Savings', 'Personal') THEN amount ELSE 0 END) as personalBalance,
                    SUM(CASE WHEN walletType = 'Share Capital' THEN amount ELSE 0 END) as shareBalance
                FROM payments WHERE memberId = ? AND status = 'completed'
            `, [memberId]),
            dbAll('SELECT * FROM payments WHERE memberId = ? AND status = "completed" ORDER BY paymentDate DESC LIMIT 50', [memberId])
        ]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="contribution_summary.pdf"');
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Contribution & Wealth Summary');

        doc.fontSize(12).font('Helvetica-Bold').text(`Member: ${member.name}`, 50, 140);
        doc.fontSize(10).font('Helvetica').text(`ID: ${member.membershipNumber || '---'} | Statement Date: ${new Date().toLocaleDateString()}`, 50, 155);

        // Stats Cards
        const sacco = balance.saccoBalance || 0;
        const personal = balance.personalBalance || 0;
        const shares = balance.shareBalance || 0;
        const total = sacco + personal + shares;

        drawSummaryCard(doc, 'Sacco Savings', `KES ${sacco.toLocaleString()}`, '#2563eb', 50, 180, 153);
        drawSummaryCard(doc, 'Personal Savings', `KES ${personal.toLocaleString()}`, '#10b981', 221, 180, 153);
        drawSummaryCard(doc, 'Total Wealth', `KES ${total.toLocaleString()}`, '#1e293b', 392, 180, 153);

        doc.moveDown(6);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text('Recent Transactions');
        
        const cols = [
            { label: 'Date', x: 50, width: 80 },
            { label: 'Type', x: 130, width: 100 },
            { label: 'Description', x: 230, width: 220 },
            { label: 'Amount', x: 450, width: 95, align: 'right' }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);
        
        history.forEach((h, idx) => {
            if (curY > 740) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
            
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(new Date(h.timestamp).toLocaleDateString(), cols[0].x, curY);
            doc.text(h.type.replace('_', ' '), cols[1].x, curY);
            doc.text(h.description || '---', cols[2].x, curY);
            doc.font('Helvetica-Bold').text(`KES ${h.amount.toLocaleString()}`, cols[3].x, curY, { width: cols[3].width, align: 'right' });
            
            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pledges', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT p.*, m.name as memberName, m.phone as memberPhone FROM pledges p JOIN members m ON p.memberId = m.id ORDER BY p.timestamp DESC');
        let csv = 'Pledge ID,Member Name,Member Phone,Extension Date,Fee Amount (KES),Status,Note,Recorded At\n';
        rows.forEach(p => {
            csv += [
                csvCell(p.id),
                csvCell(p.memberName),
                csvCell(p.memberPhone),
                csvCell(fmtDateCSV(p.targetDate)),
                csvCell(p.pledgeFee || 100),
                csvCell(p.status ? p.status.toUpperCase() : 'PENDING'),
                csvCell(p.note),
                csvCell(fmtDateCSV(p.timestamp))
            ].join(',') + '\n';
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="pledges_export.csv"');
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pledges.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const pledges = await dbAll('SELECT p.*, m.name as memberName, m.phone as memberPhone FROM pledges p JOIN members m ON p.memberId = m.id ORDER BY p.timestamp DESC');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="pledges_report.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Member Commitment Pledges');

        const cols = [
            { label: 'Member', x: 50, width: 140 },
            { label: 'Extension', x: 190, width: 90 },
            { label: 'Fee', x: 280, width: 60 },
            { label: 'Status', x: 340, width: 80 },
            { label: 'Note', x: 420, width: 125 }
        ];

        let curY = drawTableHeader(doc, cols, doc.y);
        
        pledges.forEach((p, idx) => {
            if (curY > 740) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
            
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.font('Helvetica-Bold').text(p.memberName, cols[0].x, curY);
            doc.font('Helvetica').text(new Date(p.targetDate).toLocaleDateString('en-GB'), cols[1].x, curY);
            doc.text(`KES ${p.pledgeFee}`, cols[2].x, curY);
            
            const statusColor = p.status === 'fulfilled' ? '#10b981' : '#f59e0b';
            doc.fillColor(statusColor).font('Helvetica-Bold').text(p.status.toUpperCase(), cols[3].x, curY);
            
            doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(p.note || '---', cols[4].x, curY, { width: cols[4].width });
            
            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT p.*, m.name as memberName FROM payments p JOIN members m ON p.memberId = m.id ORDER BY p.paymentDate DESC');
        let csv = 'Transaction ID,Member Name,Amount (KES),Wallet / Fund,Payment Date,Reference,Note\n';
        rows.forEach(p => {
            csv += [
                csvCell(p.id),
                csvCell(p.memberName),
                csvCell(Number(p.amount || 0).toLocaleString('en-KE')),
                csvCell(p.walletType || 'SACCO Savings'),
                csvCell(fmtDateCSV(p.paymentDate)),
                csvCell(p.reference),
                csvCell(p.note)
            ].join(',') + '\n';
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="payments_export.csv"');
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const payments = await dbAll('SELECT p.*, m.name as memberName FROM payments p JOIN members m ON p.memberId = m.id ORDER BY p.paymentDate DESC');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="payments_report.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'General Payments & Contributions');

        const cols = [
            { label: 'Date', x: 50, width: 80 },
            { label: 'Member', x: 130, width: 150 },
            { label: 'Wallet', x: 280, width: 100 },
            { label: 'Ref', x: 380, width: 90 },
            { label: 'Amount', x: 470, width: 75, align: 'right' }
        ];

        let curY = drawTableHeader(doc, cols, doc.y);
        
        payments.forEach((p, idx) => {
            if (curY > 740) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
            
            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.text(new Date(p.paymentDate).toLocaleDateString('en-GB'), cols[0].x, curY);
            doc.font('Helvetica-Bold').text(p.memberName, cols[1].x, curY);
            doc.font('Helvetica').text(p.walletType || 'SACCO Savings', cols[2].x, curY);
            doc.text(p.reference || '---', cols[3].x, curY);
            doc.font('Helvetica-Bold').text(Number(p.amount).toLocaleString(), cols[4].x, curY, { width: cols[4].width, align: 'right' });
            
            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PORTFOLIO / INVESTMENTS EXPORTS
// ═══════════════════════════════════════════════════════════

// --- CSV Investment Portfolio Export ---
router.get('/investments', authRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM investments ORDER BY purchaseDate DESC');
        
        let csv = 'Asset Name,Type,Amount Invested,Current Valuation,ROI (%),Status,Purchase Date,Notes\n';
        rows.forEach(i => {
            const roi = i.amountInvested > 0 ? (((i.currentValue - i.amountInvested) / i.amountInvested) * 100).toFixed(1) : '0.0';
            csv += [
                csvCell(i.name),
                csvCell(i.type),
                csvCell(i.amountInvested),
                csvCell(i.currentValue),
                csvCell(`${roi}%`),
                csvCell((i.status || 'active').toUpperCase()),
                csvCell(fmtDateCSV(i.purchaseDate)),
                csvCell(i.notes || '')
            ].join(',') + '\n';
        });

        // Summary row
        const totalInvested = rows.reduce((s, i) => s + (i.amountInvested || 0), 0);
        const totalValue = rows.reduce((s, i) => s + (i.currentValue || 0), 0);
        const totalRoi = totalInvested > 0 ? (((totalValue - totalInvested) / totalInvested) * 100).toFixed(1) : '0.0';
        csv += `\n"PORTFOLIO TOTALS","","${totalInvested}","${totalValue}","${totalRoi}%","","",""\n`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="portfolio_investments.csv"');
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PDF Investment Portfolio Report ---
router.get('/investments.pdf', authRequired, async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM investments ORDER BY status ASC, purchaseDate DESC");
        const totals = await dbGet(`
            SELECT COALESCE(SUM(amountInvested),0) as totalInvested, COALESCE(SUM(currentValue),0) as currentTotal
            FROM investments WHERE status = 'active'
        `);
        const profit = totals.currentTotal - totals.totalInvested;
        const roi = totals.totalInvested > 0 ? ((profit / totals.totalInvested) * 100).toFixed(1) : '0.0';
        const activeCount = rows.filter(r => r.status === 'active').length;
        const fmtMoney = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`;

        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="portfolio_report.pdf"');
        doc.pipe(res);

        await drawReportHeader(doc, 'Portfolio Intelligence Report');

        // Summary Cards
        const cardY = doc.y + 5;
        drawSummaryCard(doc, 'Capital Deployed', fmtMoney(totals.totalInvested), '#1e293b', 50, cardY);
        drawSummaryCard(doc, 'Portfolio Valuation', fmtMoney(totals.currentTotal), profit >= 0 ? '#16a34a' : '#dc2626', 213, cardY);
        drawSummaryCard(doc, 'Net ROI', `${roi >= 0 ? '+' : ''}${roi}%`, profit >= 0 ? '#16a34a' : '#dc2626', 376, cardY);
        doc.y = cardY + 70;

        // Stats line
        doc.fontSize(8).font('Helvetica').fillColor('#64748b')
           .text(`${activeCount} Active Assets  |  ${rows.length - activeCount} Liquidated  |  Unrealized ${profit >= 0 ? 'Gains' : 'Losses'}: ${fmtMoney(Math.abs(profit))}`, 50, doc.y, { align: 'center', width: doc.page.width - 100 });
        doc.y += 20;

        // Table
        const cols = [
            { label: 'Asset Name',     x: 55,  width: 120 },
            { label: 'Type',           x: 175, width: 70 },
            { label: 'Capital',        x: 245, width: 75, align: 'right' },
            { label: 'Valuation',      x: 320, width: 75, align: 'right' },
            { label: 'ROI',            x: 395, width: 45, align: 'right' },
            { label: 'Status',         x: 440, width: 50 },
            { label: 'Acquired',       x: 490, width: 55 }
        ];

        let curY = drawTableHeader(doc, cols, doc.y);

        rows.forEach((inv, idx) => {
            if (curY > 720) {
                doc.addPage();
                curY = drawTableHeader(doc, cols, 50);
            }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();
            
            const iRoi = inv.amountInvested > 0 ? (((inv.currentValue - inv.amountInvested) / inv.amountInvested) * 100).toFixed(1) : '0.0';
            
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#334155').text(inv.name, cols[0].x, curY, { width: cols[0].width });
            doc.font('Helvetica').text(inv.type, cols[1].x, curY);
            doc.text(Number(inv.amountInvested).toLocaleString(), cols[2].x, curY, { width: cols[2].width, align: 'right' });
            doc.font('Helvetica-Bold').fillColor(inv.currentValue >= inv.amountInvested ? '#16a34a' : '#dc2626')
               .text(Number(inv.currentValue).toLocaleString(), cols[3].x, curY, { width: cols[3].width, align: 'right' });
            doc.fillColor(iRoi >= 0 ? '#16a34a' : '#dc2626')
               .text(`${iRoi >= 0 ? '+' : ''}${iRoi}%`, cols[4].x, curY, { width: cols[4].width, align: 'right' });
            doc.fillColor('#64748b').font('Helvetica')
               .text((inv.status || 'active').toUpperCase(), cols[5].x, curY);
            doc.text(fmtDateCSV(inv.purchaseDate), cols[6].x, curY);

            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Treasury Ledger Exports ---

router.get('/transactions.csv', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM transactions ORDER BY timestamp DESC');
        let csv = 'ID,Type,Description,Amount (KES),Performed By,Date & Time,Reference\n';
        rows.forEach(t => {
            csv += [
                csvCell(t.id),
                csvCell(t.type === 'credit' ? 'IN' : 'OUT'),
                csvCell(t.description),
                csvCell(t.amount),
                csvCell(t.performed_by),
                csvCell(t.timestamp),
                csvCell(t.reference || '---')
            ].join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="treasury_ledger.csv"');
        res.send(csv);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/transactions.pdf', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM transactions ORDER BY timestamp DESC');
        const credits = rows.filter(r => r.type === 'credit').reduce((s, r) => s + r.amount, 0);
        const debits = rows.filter(r => r.type === 'debit').reduce((s, r) => s + r.amount, 0);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="fund_ledger.pdf"');
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Treasury Ledger Report');

        const startY = doc.y;
        drawSummaryCard(doc, 'Total Inflows', `KES ${credits.toLocaleString()}`, '#10b981', 50, startY, 153);
        drawSummaryCard(doc, 'Total Outflows', `KES ${debits.toLocaleString()}`, '#ef4444', 218, startY, 153);
        drawSummaryCard(doc, 'Net liquidity', `KES ${(credits - debits).toLocaleString()}`, (credits - debits) >= 0 ? '#10b981' : '#ef4444', 386, startY, 153);
        
        doc.y = startY + 80;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Transaction History');

        const cols = [
            { label: 'Type', x: 50, width: 40 },
            { label: 'Description', x: 95, width: 220 },
            { label: 'Amount (KES)', x: 315, width: 90, align: 'right' },
            { label: 'Date', x: 410, width: 135 }
        ];

        let curY = drawTableHeader(doc, cols, doc.y + 10);

        rows.forEach((t, idx) => {
            if (curY > 740) {
                doc.addPage();
                curY = drawTableHeader(doc, cols, 50);
            }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();

            doc.fontSize(8).font('Helvetica').fillColor('#334155');
            doc.fillColor(t.type === 'credit' ? '#10b981' : '#ef4444').font('Helvetica-Bold').text(t.type === 'credit' ? 'IN' : 'OUT', cols[0].x, curY);
            doc.fillColor('#334155').font('Helvetica').text(t.description, cols[1].x, curY, { width: cols[1].width });
            doc.font('Helvetica-Bold').text(t.amount.toLocaleString(), cols[2].x, curY, { width: cols[2].width, align: 'right' });
            doc.font('Helvetica').text(new Date(t.timestamp).toLocaleString(), cols[3].x, curY, { width: cols[3].width });

            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Global Loan Portfolio Report (Admin) ---
router.get('/loan-portfolio.pdf', authRequired, async (req, res) => {
    try {
        const loans = await dbAll(`
            SELECT l.*, m.name as borrowerName, m.membershipNumber,
                   (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = l.id) as totalRepaid
            FROM loans l
            JOIN members m ON l.memberId = m.id
            WHERE l.status IN ('active', 'overdue')
            ORDER BY l.disbursedDate DESC
        `);

        const stats = await dbGet(`
            SELECT 
                COUNT(*) as activeCount,
                SUM(amount) as totalDisbursed,
                SUM((SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = l.id)) as totalRepaid
            FROM loans l
            WHERE status IN ('active', 'overdue')
        `);

        const disbursed = stats.totalDisbursed || 0;
        const repaid = stats.totalRepaid || 0;
        const outstanding = Math.max(0, disbursed - repaid);
        const overdueCount = loans.filter(l => l.status === 'overdue').length;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="global_loan_portfolio.pdf"');
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        doc.pipe(res);

        await drawReportHeader(doc, 'Global Loan Portfolio Analysis');

        // Executive Summary
        const startY = 150;
        drawSummaryCard(doc, 'Active Portfolio', `KES ${disbursed.toLocaleString()}`, '#1e293b', 50, startY, 153);
        drawSummaryCard(doc, 'Capital Recouped', `KES ${repaid.toLocaleString()}`, '#10b981', 221, startY, 153);
        drawSummaryCard(doc, 'At Risk (PAR)', `KES ${outstanding.toLocaleString()}`, outstanding > 0 ? '#ef4444' : '#10b981', 392, startY, 153);

        doc.y = startY + 80;
        doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(`Total Active Loans: ${stats.activeCount}  |  Overdue Cases: ${overdueCount}  |  Repayment Rate: ${disbursed > 0 ? Math.round((repaid / disbursed) * 100) : 0}%`, 50, doc.y, { align: 'center', width: 495 });

        // Portfolio Table
        doc.y += 25;
        const cols = [
            { label: 'Borrower', x: 50, width: 140 },
            { label: 'Principal', x: 190, width: 80, align: 'right' },
            { label: 'Repaid', x: 270, width: 80, align: 'right' },
            { label: 'Balance', x: 350, width: 80, align: 'right' },
            { label: 'Status', x: 440, width: 50 },
            { label: 'Due Date', x: 490, width: 55 }
        ];

        let curY = drawTableHeader(doc, cols, doc.y);

        loans.forEach((l, idx) => {
            if (curY > 750) { doc.addPage(); curY = drawTableHeader(doc, cols, 50); }
            if (idx % 2 === 1) doc.rect(50, curY - 2, 495, 18).fillColor('#f8fafc').fill();

            const balance = Math.max(0, l.amount - (l.totalRepaid || 0));
            
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#334155').text(l.borrowerName, cols[0].x, curY, { width: cols[0].width, ellipsis: true });
            doc.font('Helvetica').text(l.amount.toLocaleString(), cols[1].x, curY, { width: cols[1].width, align: 'right' });
            doc.text(l.totalRepaid.toLocaleString(), cols[2].x, curY, { width: cols[2].width, align: 'right' });
            doc.font('Helvetica-Bold').fillColor(l.status === 'overdue' ? '#ef4444' : '#334155').text(balance.toLocaleString(), cols[3].x, curY, { width: cols[3].width, align: 'right' });
            
            const statusColor = l.status === 'overdue' ? '#ef4444' : '#10b981';
            doc.fillColor(statusColor).text(l.status.toUpperCase(), cols[4].x, curY);
            doc.fillColor('#64748b').font('Helvetica').text(new Date(l.dueDate).toLocaleDateString(), cols[5].x, curY);

            curY += 18;
        });

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

