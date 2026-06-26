const path = require('path');
const fs = require('fs');
const { getSystemSettings } = require('./helpers');

async function drawReportHeader(doc, title, period = null) {
    const s = await getSystemSettings();
    const orgName = s.organization_name || 'LIFE-LONG UNITY CAPITAL GROUP';
    
    // Header Background Accent (Dark Slate)
    doc.rect(0, 0, doc.page.width, 10).fillColor('#1e293b').fill();
    doc.rect(0, 10, doc.page.width, 100).fillColor('#f8fafc').fill();
    
    // Logo (if exists)
    try {
        const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 35, { width: 40 });
        } else {
            const favPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'favicon.png');
            if (fs.existsSync(favPath)) {
                doc.image(favPath, 50, 35, { width: 40 });
            }
        }
    } catch (imageErr) {
        console.error('PDF Header Image Load Failed (Skipped):', imageErr.message);
    }

    // Organization Branding
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b').text(orgName.toUpperCase(), 100, 48, { width: 350 });
    
    // Report Title
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#2563eb').text((title || 'OFFICIAL REPORT').toUpperCase(), 50, 78, { align: 'right', width: doc.page.width - 100 });
    
    // Decorative Bottom Line
    doc.moveTo(50, 105).lineTo(doc.page.width - 50, 105).strokeColor('#e2e8f0').lineWidth(1.2).stroke();
    
    doc.y = 115;
    const metaStr = `REF: LLUCG-GEN-${Date.now().toString().slice(-6)} | Generated: ${new Date().toLocaleString('en-GB')}${period ? ` | PERIOD: ${period}` : ''}`;
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8').text(metaStr, 50, doc.y, { align: 'right', width: doc.page.width - 100 });
    doc.y += 20;
}

function drawWatermark(doc) {
    doc.save();
    doc.opacity(0.04);
    doc.fontSize(60).font('Helvetica-Bold').fillColor('#1e293b');
    doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.text('OFFICIAL DOCUMENT', 0, doc.page.height / 2 - 30, { align: 'center', width: doc.page.width });
    doc.restore();
}

function drawSignatureBlock(doc, roleName = 'AUTHORIZING OFFICER', yPos) {
    const currentY = yPos || doc.y + 40;
    if (currentY > 750) doc.addPage();
    
    doc.y = currentY;
    doc.moveTo(50, doc.y).lineTo(200, doc.y).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text(roleName.toUpperCase(), 50, doc.y + 5);
    doc.fontSize(7).font('Helvetica').text('Signature & Official Stamp', 50, doc.y + 15);
    
    doc.moveTo(doc.page.width - 200, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text('DATE OF APPROVAL', doc.page.width - 200, doc.y + 5, { align: 'right', width: 150 });
    
    doc.moveDown(4);
}

function drawPageFooter(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        drawWatermark(doc);
        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
           .text(
               `Page ${i + 1} of ${pages.count}  |  Confidential Organizational Document  |  © ${new Date().getFullYear()}`,
               50,
               doc.page.height - 40,
               { align: 'center', width: doc.page.width - 100 }
           );
        doc.page.margins.bottom = oldBottomMargin;
    }
}

async function drawReportNote(doc, text, options = {}) {
    const threshold = options.threshold || 680;
    if (doc.y > threshold) {
        doc.addPage();
        if (options.title) {
            await drawReportHeader(doc, options.title, options.period);
        } else {
            doc.y = 100;
        }
    } else {
        doc.y += 20;
    }
    
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#94a3b8')
       .text(text, 55, doc.y, { align: 'justify', width: doc.page.width - 110, lineGap: 2 });
}

function drawSummaryCard(doc, label, value, color = '#1e293b', x, y, width = 160) {
    // Card background
    doc.rect(x, y, width, 50).fillColor('#ffffff').strokeColor('#cbd5e1').lineWidth(0.5).fillAndStroke();
    // Accent Stripe
    doc.rect(x, y, 3, 50).fillColor(color).fill();
    
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#64748b').text(label.toUpperCase(), x + 12, y + 12);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(value, x + 12, y + 25);
}

function drawTableHeader(doc, columns, y, height = 22) {
    doc.rect(50, y, doc.page.width - 100, height).fillColor('#1e293b').fill();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
    columns.forEach(col => {
        doc.text(col.label.toUpperCase(), col.x, y + (height / 2) - 4, { width: col.width, align: col.align || 'left' });
    });
    return y + height + 5;
}

function drawIDCardBack(doc, x, y, w, h) {
    const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
    doc.save();
    doc.roundedRect(x, y, w, h, 8).clip();
    const grad = doc.linearGradient(x, y, x + w, y + h);
    grad.stop(0, '#1e293b').stop(1, '#0f172a');
    doc.rect(x, y, w, h).fill(grad);

    if (fs.existsSync(logoPath)) {
        doc.opacity(0.08);
        doc.image(logoPath, x + w/2 - 40, y + h/2 - 40, { width: 80 });
        doc.opacity(1);
    }

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text('TERMS & CONDITIONS', x + 15, y + 15);
    const terms = [
        "1. This card remains the property of LLUCG.",
        "2. It must be produced on demand for verification.",
        "3. Loss of this card should be reported immediately.",
        "4. This card is non-transferable."
    ];
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(5.5);
    terms.forEach((t, i) => {
        doc.text(t, x + 15, y + 30 + (i * 10), { width: w - 30 });
    });

    doc.moveTo(x + 15, y + h - 45).lineTo(x + 100, y + h - 45).strokeColor('#475569').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').fontSize(5).text('MEMBER SIGNATURE', x + 15, y + h - 40);

    doc.moveTo(x + w - 100, y + h - 45).lineTo(x + w - 15, y + h - 45).strokeColor('#475569').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').fontSize(5).text('AUTHORIZED OFFICIAL', x + w - 100, y + h - 40, { align: 'right', width: 85 });

    doc.fillColor('#fbbf24').fontSize(5).text('LLUCG | Unity in Prosperity', x, y + h - 15, { width: w, align: 'center' });
    doc.restore();
}

module.exports = {
    drawReportHeader,
    drawWatermark,
    drawSignatureBlock,
    drawPageFooter,
    drawReportNote,
    drawSummaryCard,
    drawTableHeader,
    drawIDCardBack
};
