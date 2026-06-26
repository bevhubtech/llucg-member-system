const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const { 
    drawReportHeader, drawTableHeader, 
    drawPageFooter, drawReportNote, drawSignatureBlock
} = require('../utils/pdf');
const { 
    authRequired, sharedAdminRequired, 
    secretaryRequired, memberAuthRequired, sharedAuth 
} = require('../middleware/auth');

// --- Meetings ---

router.get('/meetings/checkin/:id', sharedAuth, async (req, res) => {
    try {
        const meetingId = req.params.id;
        const user = req.member || req.admin;
        if (!user) return res.status(401).json({ error: 'Authentication required for check-in.' });
        
        const memberId = user.id || user.memberId;
        const meeting = await dbGet('SELECT * FROM meetings WHERE id = ?', [meetingId]);
        if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });

        // Upsert attendance
        await dbRun(`
            INSERT INTO meeting_attendance (meetingId, memberId, attended, checkInTime) 
            VALUES (?, ?, 1, ?)
            ON CONFLICT(meetingId, memberId) DO UPDATE SET attended=1, checkInTime=?
        `, [meetingId, memberId, new Date().toISOString(), new Date().toISOString()]);

        logActivity('Meeting Check-in', 'Meeting', meetingId, `Member ${memberId} checked in via QR for: ${meeting.title}`);
        
        res.json({ 
            success: true, 
            message: 'Check-in Successful', 
            memberName: user.name || 'Member',
            meetingTitle: meeting.title
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meetings', authRequired, secretaryRequired, async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM meetings ORDER BY date DESC');
        res.json({ meetings: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/meetings', authRequired, secretaryRequired, async (req, res) => {
    const { title, date, location, agenda, notes, meetingType, isMandatory } = req.body;
    try {
        const r = await dbRun(`
            INSERT INTO meetings (title, date, location, agenda, notes, meetingType, isMandatory, created_at) 
            VALUES (?,?,?,?,?,?,?,?)
        `, [title, date, location, agenda, notes, meetingType || 'regular', isMandatory ? 1 : 0, new Date().toISOString()]);
        
        logActivity('Meeting Organized', 'Meeting', r.lastID, `Title: ${title} on ${date}`);
        res.json({ id: r.lastID, title, date });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/meetings/:id/check-in', authRequired, secretaryRequired, async (req, res) => {
    const { membershipNumber } = req.body;
    try {
        const meetingId = req.params.id;
        const member = await dbGet('SELECT * FROM members WHERE membershipNumber = ? COLLATE NOCASE', [membershipNumber]);
        if (!member) return res.status(404).json({ error: 'Member not found.' });

        await dbRun(`
            INSERT INTO meeting_attendance (meetingId, memberId, attended, checkInTime) 
            VALUES (?, ?, 1, ?)
            ON CONFLICT(meetingId, memberId) DO UPDATE SET attended = 1, checkInTime = ?
        `, [meetingId, member.id, new Date().toISOString(), new Date().toISOString()]);

        res.json({ success: true, memberName: member.name });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meetings/:id/minutes.pdf', sharedAuth, async (req, res) => {
    try {
        const m = await dbGet('SELECT * FROM meetings WHERE id = ?', [req.params.id]);
        if (!m) return res.status(404).json({ error: 'Meeting not found' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="minutes_${m.id}.pdf"`);
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);
        await drawReportHeader(doc, 'Official Meeting Minutes');
        
        doc.fontSize(12).font('Helvetica-Bold').text(m.title.toUpperCase());
        doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(m.date).toLocaleString()} | Location: ${m.location}`);
        doc.moveDown();
        doc.fontSize(10).font('Helvetica-Bold').text('AGENDA');
        doc.fontSize(10).font('Helvetica').text(m.agenda || 'No agenda recorded.');

        if (m.minutes) {
            doc.moveDown();
            doc.fontSize(10).font('Helvetica-Bold').text('MEETING MINUTES');
            doc.fontSize(10).font('Helvetica').text(m.minutes, { lineGap: 4 });
        }

        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/meetings/:id/attendance-action.pdf', memberAuthRequired, async (req, res) => {
    try {
        const memberId = req.member.id;
        const meetingId = req.params.id;
        
        const [m, a, member] = await Promise.all([
            dbGet('SELECT * FROM meetings WHERE id = ?', [meetingId]),
            dbGet('SELECT * FROM meeting_attendance WHERE meetingId = ? AND memberId = ?', [meetingId, memberId]),
            dbGet('SELECT * FROM members WHERE id = ?', [memberId])
        ]);

        if (!m) return res.status(404).json({ error: 'Meeting not found' });
        if (!a || !a.attended) return res.status(403).json({ error: 'Attendance record not found. You may not have checked in.' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Attendance_Action_${m.id}.pdf"`);
        
        // Use Landscape for a more "Certificate" feel
        const doc = new PDFDocument({ 
            margin: 0, 
            size: 'A4', 
            layout: 'landscape',
            bufferPages: true 
        });
        doc.pipe(res);

        // --- Decorative Border ---
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        
        // Outer Thick Border (Midnight Blue)
        doc.rect(20, 20, pageWidth - 40, pageHeight - 40).lineWidth(3).strokeColor('#1e293b').stroke();
        
        // Inner Thin Border (Gold Accent)
        doc.rect(30, 30, pageWidth - 60, pageHeight - 60).lineWidth(1).strokeColor('#fbbf24').stroke();

        // Corner Accents (Fleur-de-lis style or simple circles)
        const drawCorner = (x, y) => {
            doc.circle(x, y, 5).fill('#1e293b');
        };
        drawCorner(30, 30);
        drawCorner(pageWidth - 30, 30);
        drawCorner(30, pageHeight - 30);
        drawCorner(pageWidth - 30, pageHeight - 30);

        // --- Logo & Header ---
        try {
            const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, pageWidth/2 - 30, 50, { width: 60 });
            }
        } catch (e) {}

        doc.y = 120;
        doc.fontSize(32).font('Helvetica-Bold').fillColor('#1e293b').text('CERTIFICATE', { align: 'center' });
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#64748b').text('OF ATTENDANCE', { align: 'center' });
        
        doc.moveDown(1.5);
        doc.fontSize(16).font('Times-Italic').fillColor('#475569').text('This is to certify that', { align: 'center' });
        
        doc.moveDown(1);
        doc.fontSize(38).font('Helvetica-Bold').fillColor('#2563eb').text(member.name.toUpperCase(), { align: 'center' });
        
        doc.moveDown(1);
        doc.fontSize(14).font('Helvetica').fillColor('#475569').text('has fulfilled the requirements of participation and was present at:', { align: 'center' });
        
        doc.moveDown(1);
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e293b').text(m.title, { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').fillColor('#64748b')
           .text(`Held on ${new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} at ${m.location}`, { align: 'center' });

        // --- Footer Data ---
        doc.moveDown(2);
        doc.fontSize(9).font('Helvetica').fillColor('#94a3b8')
           .text(`Membership No: ${member.membershipNumber || '---'}  |  Verified Check-in: ${new Date(a.checkInTime).toLocaleTimeString()}  |  Certificate ID: ${m.id}-${member.id}-${Date.now().toString().slice(-4)}`, { align: 'center' });

        // --- Signatures ---
        const sigY = pageHeight - 110;
        
        // Signature Line 1
        doc.moveTo(100, sigY).lineTo(300, sigY).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('CHAIRMAN', 100, sigY + 10, { width: 200, align: 'center' });
        
        // Signature Line 2
        doc.moveTo(pageWidth - 300, sigY).lineTo(pageWidth - 100, sigY).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('GENERAL SECRETARY', pageWidth - 300, sigY + 10, { width: 200, align: 'center' });

        // --- Watermark ---
        doc.save();
        doc.opacity(0.03);
        doc.fontSize(80).font('Helvetica-Bold').fillColor('#1e293b');
        doc.text('OFFICIAL RECORD', 0, pageHeight/2 - 40, { align: 'center', width: pageWidth });
        doc.restore();

        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save / Update meeting minutes
router.put('/meetings/:id', authRequired, secretaryRequired, async (req, res) => {
    const { title, date, location, agenda, minutes } = req.body;
    try {
        await dbRun(`
            UPDATE meetings 
            SET title = ?, date = ?, location = ?, agenda = ?, minutes = ?
            WHERE id = ?
        `, [title, date, location, agenda, minutes, req.params.id]);
        
        logActivity('Meeting Updated', 'Meeting', req.params.id, `Details updated by ${req.admin.username}`);
        res.json({ message: 'Meeting updated successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/meetings/:id/minutes', authRequired, secretaryRequired, async (req, res) => {
    const { minutes } = req.body;
    try {
        const m = await dbGet('SELECT id FROM meetings WHERE id = ?', [req.params.id]);
        if (!m) return res.status(404).json({ error: 'Meeting not found' });
        await dbRun('UPDATE meetings SET minutes = ? WHERE id = ?', [minutes, req.params.id]);
        logActivity('Minutes Updated', 'Meeting', req.params.id, `Minutes recorded by ${req.admin.username}`, req.admin.username);
        res.json({ message: 'Minutes saved successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});



// --- Meeting Attendance ---

router.get('/meetings/:id/attendance', authRequired, secretaryRequired, async (req, res) => {
    try {
        const meetingId = req.params.id;
        // Join members with attendance, ensure every member is listed
        const attendance = await dbAll(`
            SELECT m.id as memberId, m.name, m.membershipNumber, 
                   COALESCE(a.attended, 0) as attended, a.checkInTime
            FROM members m
            LEFT JOIN meeting_attendance a ON a.memberId = m.id AND a.meetingId = ?
            WHERE m.status != 'inactive'
            ORDER BY m.name ASC
        `, [meetingId]);
        res.json({ attendance });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/meetings/:id/attendance', authRequired, secretaryRequired, async (req, res) => {
    const { attendance } = req.body;
    try {
        const meetingId = req.params.id;
        const meeting = await dbGet('SELECT * FROM meetings WHERE id = ?', [meetingId]);
        
        // Fetch auto-penalty settings
        const settings = await dbAll('SELECT key, value FROM settings');
        const setMap = settings.reduce((m, s) => ({...m, [s.key]: s.value}), {});
        const isAutoEnabled = setMap.auto_penalty_enabled === 'true';
        const absentFine = parseFloat(setMap.absentee_penalty_amount || 100);

        for (let item of attendance) {
            await dbRun(`
                INSERT INTO meeting_attendance (meetingId, memberId, attended)
                VALUES (?, ?, ?)
                ON CONFLICT(meetingId, memberId) DO UPDATE SET attended = ?
            `, [meetingId, item.memberId, item.attended ? 1 : 0, item.attended ? 1 : 0]);
            
            // Auto-penalty logic
            if (isAutoEnabled && !item.attended && absentFine > 0) {
                const reason = `Absentee Fine (Meeting: ${meeting?.title || `ID #${meetingId}`})`;
                // Check if they already have an absentee penalty for this meeting
                const exists = await dbGet(`SELECT id FROM penalties WHERE memberId=? AND reason=?`, [item.memberId, reason]);
                if (!exists) {
                    await dbRun(`INSERT INTO penalties (memberId, amount, reason, issuedDate) VALUES (?, ?, ?, ?)`, 
                        [item.memberId, absentFine, reason, new Date().toISOString()]);
                }
            } else if (isAutoEnabled && item.attended) {
                // If they were marked present but previously had an absentee fine, optionally remove it
                const reason = `Absentee Fine (Meeting: ${meeting?.title || `ID #${meetingId}`})`;
                await dbRun(`DELETE FROM penalties WHERE memberId=? AND reason=? AND paidStatus='unpaid'`, [item.memberId, reason]);
            }
        }
        res.json({ message: 'Attendance records updated and penalties applied if applicable.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Meeting Resolutions ---

router.get('/meetings/:id/resolutions', authRequired, secretaryRequired, async (req, res) => {
    try {
        const resolutions = await dbAll('SELECT * FROM meeting_resolutions WHERE meetingId = ? ORDER BY timestamp DESC', [req.params.id]);
        res.json({ resolutions });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/meetings/:id/resolutions', authRequired, secretaryRequired, async (req, res) => {
    const { resolution, proposedBy } = req.body;
    try {
        await dbRun('INSERT INTO meeting_resolutions (meetingId, resolution, proposedBy, status, timestamp) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, resolution, proposedBy, 'tabled', new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a meeting resolution
router.delete('/meetings/:id/resolutions/:rId', authRequired, secretaryRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM meeting_resolutions WHERE id = ? AND meetingId = ?', [req.params.rId, req.params.id]);
        res.json({ message: 'Resolution removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a meeting resolution status
router.put('/meetings/:id/resolutions/:rId', authRequired, secretaryRequired, async (req, res) => {
    const { status } = req.body;
    try {
        await dbRun('UPDATE meeting_resolutions SET status = ? WHERE id = ?', [status, req.params.rId]);
        res.json({ message: 'Resolution status updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a meeting
router.delete('/meetings/:id', authRequired, secretaryRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM meeting_resolutions WHERE meetingId = ?', [req.params.id]);
        await dbRun('DELETE FROM meeting_attendance WHERE meetingId = ?', [req.params.id]);
        await dbRun('DELETE FROM meetings WHERE id = ?', [req.params.id]);
        logActivity('Meeting Deleted', 'Meeting', req.params.id, `Meeting and associated records removed by ${req.admin.username}`);
        res.json({ message: 'Meeting and all associated records removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Polls ---

router.get('/polls', authRequired, sharedAdminRequired, async (req, res) => {
    try {
        const polls = await dbAll('SELECT * FROM polls ORDER BY timestamp DESC');
        for (let p of polls) {
            p.options = await dbAll('SELECT * FROM poll_options WHERE pollId = ?', [p.id]);
            // Only send counts to keep it anonymous
            const counts = await dbAll('SELECT optionId, COUNT(*) as count FROM poll_votes WHERE pollId = ? GROUP BY optionId', [p.id]);
            const countMap = counts.reduce((acc, c) => ({ ...acc, [c.optionId]: c.count }), {});
            p.options.forEach(o => o.votes = countMap[o.id] || 0);
            
            // For the frontend to show total, we send a flat count
            const total = await dbGet('SELECT COUNT(*) as c FROM poll_votes WHERE pollId = ?', [p.id]);
            p.totalVotes = total.c;
            
            // Provide a dummy votes array of correct length so frontend .length checks don't break
            p.votes = new Array(total.c).fill({});
        }
        res.json({ polls });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/polls', authRequired, secretaryRequired, async (req, res) => {
    const { question, closeDate, options } = req.body;
    if (!question || !options || options.length < 2) return res.status(400).json({ error: 'Question and at least 2 options required.' });

    try {
        const timestamp = new Date().toISOString();
        const r = await dbRun('INSERT INTO polls (question, status, createdBy, closeDate, timestamp) VALUES (?, ?, ?, ?, ?)',
            [question, 'active', req.admin.username, closeDate || null, timestamp]);
        const pollId = r.lastID;

        for (const optText of options) {
            await dbRun('INSERT INTO poll_options (pollId, optionText) VALUES (?, ?)', [pollId, optText]);
        }

        logActivity('Poll Created', 'Poll', pollId, `New resolution: ${question}`);
        res.json({ success: true, id: pollId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/polls/:id/close', authRequired, secretaryRequired, async (req, res) => {
    try {
        await dbRun("UPDATE polls SET status = 'closed' WHERE id = ?", [req.params.id]);
        logActivity('Poll Closed', 'Poll', req.params.id, `Poll manually closed by ${req.admin.username}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/polls/:id/admin-vote', authRequired, secretaryRequired, async (req, res) => {
    const { memberId, optionId } = req.body;
    try {
        await dbRun('INSERT INTO poll_votes (pollId, optionId, memberId, timestamp) VALUES (?, ?, ?, ?)',
            [req.params.id, optionId, memberId, new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'This member has already voted in this poll.' });
        res.status(500).json({ error: err.message });
    }
});

// Member voting
router.post('/polls/:id/vote', memberAuthRequired, async (req, res) => {
    const { optionId } = req.body;
    try {
        const poll = await dbGet('SELECT * FROM polls WHERE id = ?', [req.params.id]);
        if (!poll) return res.status(404).json({ error: 'Poll not found.' });
        if (poll.status === 'closed') return res.status(400).json({ error: 'This poll is closed.' });

        await dbRun('INSERT INTO poll_votes (pollId, optionId, memberId, timestamp) VALUES (?, ?, ?, ?)',
            [req.params.id, optionId, req.member.id, new Date().toISOString()]);
        res.json({ success: true });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'You have already voted in this poll.' });
        res.status(500).json({ error: err.message });
    }
});

router.post('/polls/:id/resolution.pdf', memberAuthRequired, async (req, res) => {
    try {
        const poll = await dbGet('SELECT * FROM polls WHERE id = ?', [req.params.id]);
        if (!poll) return res.status(404).json({ error: 'Poll not found.' });
        
        const options = await dbAll('SELECT * FROM poll_options WHERE pollId = ?', [poll.id]);
        const counts = await dbAll('SELECT optionId, COUNT(*) as count FROM poll_votes WHERE pollId = ? GROUP BY optionId', [poll.id]);
        const countMap = counts.reduce((acc, c) => ({ ...acc, [c.optionId]: c.count }), {});
        options.forEach(o => o.votes = countMap[o.id] || 0);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Resolution_${poll.id}.pdf"`);
        
        const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
        doc.pipe(res);
        await drawReportHeader(doc, 'Official Member Resolution', `ID: ${poll.id}`);
        
        // Question Box
        const startY = doc.y;
        doc.rect(50, startY, doc.page.width - 100, 60).fillColor('#f1f5f9').fill();
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b').text('RESOLUTION QUESTION:', 70, startY + 15);
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#2563eb').text(poll.question, 70, startY + 30, { width: doc.page.width - 140 });
        
        doc.y = startY + 80;
        
        // Results Table
        const cols = [
            { label: 'Proposed Option', x: 60, width: 330 }, 
            { label: 'Vote Count', x: 400, width: 80, align: 'right' },
            { label: 'Percentage', x: 480, width: 60, align: 'right' }
        ];
        
        let curY = drawTableHeader(doc, cols, doc.y);
        const totalVotes = options.reduce((s, o) => s + o.votes, 0);
        
        options.forEach(o => {
            const pct = totalVotes > 0 ? ((o.votes / totalVotes) * 100).toFixed(1) : '0.0';
            doc.fontSize(10).font('Helvetica').fillColor('#334155').text(o.optionText, cols[0].x, curY);
            doc.font('Helvetica-Bold').text(o.votes.toString(), cols[1].x, curY, { width: cols[1].width, align: 'right' });
            doc.font('Helvetica').text(`${pct}%`, cols[2].x, curY, { width: cols[2].width, align: 'right' });
            curY += 22;
            
            // Zebra striping
            doc.moveTo(60, curY - 2).lineTo(doc.page.width - 60, curY - 2).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        });

        doc.y = curY + 30;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text(`TOTAL VOTES RECORDED: ${totalVotes}`);
        
        await drawReportNote(doc, 'This document serves as an official and permanent record of the democratic resolution passed by the membership of LLUCG. The results shown above represent the final tally as verified by the digital governance engine.');
        
        drawSignatureBlock(doc, 'GENERAL SECRETARY', doc.y + 40);
        drawPageFooter(doc);
        doc.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a poll
router.delete('/polls/:id', authRequired, secretaryRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM poll_votes WHERE pollId = ?', [req.params.id]);
        await dbRun('DELETE FROM poll_options WHERE pollId = ?', [req.params.id]);
        await dbRun('DELETE FROM polls WHERE id = ?', [req.params.id]);
        logActivity('Poll Deleted', 'Poll', req.params.id, `Poll and all votes removed by ${req.admin.username}`);
        res.json({ message: 'Poll, options, and votes permanently removed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
