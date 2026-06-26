const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');

const newCode = `
// ═══════════════════════════════════════════════════════════════
// NEW STUFF: INVESTMENTS, DIVIDENDS, KYC UPLOADS
// ═══════════════════════════════════════════════════════════════

// KYC Documents
app.post('/api/members/:id/documents', authRequired, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { documentType } = req.body;
    if (!documentType) return res.status(400).json({ error: 'documentType required.' });

    const fsNative = require('fs');
    const pathNative = require('path');
    const uploadDir = pathNative.join(__dirname, 'uploads');
    if (!fsNative.existsSync(uploadDir)) fsNative.mkdirSync(uploadDir, { recursive: true });

    const ext = req.file.originalname.includes('.') ? req.file.originalname.split('.').pop() : 'pdf';
    const filename = \`member_\${req.params.id}_\${Date.now()}.\${ext}\`;
    const filepath = pathNative.join(uploadDir, filename);

    try {
        fsNative.writeFileSync(filepath, req.file.buffer);
        const r = await dbRun(
            'INSERT INTO member_documents (memberId, documentType, filename, uploadDate) VALUES (?, ?, ?, ?)',
            [req.params.id, documentType, filename, new Date().toISOString()]
        );
        logActivity('KYC Upload', 'Document', r.lastID, \`Uploaded \${documentType} for Member \${req.params.id}\`, req.admin.username);
        res.json({ id: r.lastID, memberId: req.params.id, documentType, filename });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/members/:id/documents', authRequired, async (req, res) => {
    try {
        const docs = await dbAll('SELECT * FROM member_documents WHERE memberId = ? ORDER BY uploadDate DESC', [req.params.id]);
        res.json({ documents: docs });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/documents/:filename', authRequired, (req, res) => {
    const pathNative = require('path');
    res.sendFile(pathNative.join(__dirname, 'uploads', req.params.filename));
});

// Investments
app.get('/api/investments', authRequired, async (req, res) => {
    try { res.json({ investments: await dbAll('SELECT * FROM investments ORDER BY purchaseDate DESC') }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/investments', authRequired, async (req, res) => {
    const { name, type, amountInvested, currentValue, purchaseDate } = req.body;
    if (!name || !type || !amountInvested) return res.status(400).json({ error: 'Required fields missing.' });
    try {
        const r = await dbRun(
            'INSERT INTO investments (name, type, amountInvested, currentValue, purchaseDate) VALUES (?, ?, ?, ?, ?)',
            [name, type, amountInvested, currentValue || amountInvested, purchaseDate || new Date().toISOString()]
        );
        logActivity('Created Investment', 'Investment', r.lastID, name, req.admin.username);
        res.json({ id: r.lastID, name, type, amountInvested, currentValue: currentValue || amountInvested, purchaseDate, status: 'active' });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/investments/:id', authRequired, async (req, res) => {
    const { name, type, currentValue, status } = req.body;
    try {
        await dbRun('UPDATE investments SET name=?, type=?, currentValue=?, status=? WHERE id=?',
            [name, type, currentValue, status, req.params.id]);
        logActivity('Updated Investment', 'Investment', req.params.id, \`Updated \${name}\`, req.admin.username);
        res.json({ message: 'Investment updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dividends
app.get('/api/dividends', authRequired, async (req, res) => {
    try { res.json({ dividends: await dbAll('SELECT * FROM dividends ORDER BY distributionDate DESC') }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dividends/simulate', authRequired, async (req, res) => {
    const { poolAmount } = req.body;
    try {
        const members = await dbAll(\`SELECT m.id, m.name, COALESCE(SUM(p.amount),0) as totalContrib FROM members m LEFT JOIN payments p ON m.id=p.memberId AND p.status='completed' WHERE m.status='active' GROUP BY m.id\`);
        const totalSystemContribs = members.reduce((s, m) => s + m.totalContrib, 0);
        if (totalSystemContribs === 0) return res.status(400).json({ error: 'No contributions recorded.' });
        
        const simulation = members.map(m => {
            const ratio = m.totalContrib / totalSystemContribs;
            const payout = poolAmount * ratio;
            return { memberId: m.id, name: m.name, totalContrib: m.totalContrib, sharePercentage: (ratio*100).toFixed(2), payoutAmount: payout.toFixed(2) };
        });
        res.json({ totalSystemContribs, poolAmount, simulation });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dividends/distribute', authRequired, async (req, res) => {
    const { poolAmount } = req.body;
    try {
        const members = await dbAll(\`SELECT m.id, m.name, COALESCE(SUM(p.amount),0) as totalContrib FROM members m LEFT JOIN payments p ON m.id=p.memberId AND p.status='completed' WHERE m.status='active' GROUP BY m.id\`);
        const totalSystemContribs = members.reduce((s, m) => s + m.totalContrib, 0);
        if (totalSystemContribs === 0) return res.status(400).json({ error: 'No contributions recorded.' });

        const dDate = new Date().toISOString();
        const r = await dbRun('INSERT INTO dividends (distributionDate, totalPoolAmount, calcMethod, distributedBy, recordedBy) VALUES (?, ?, ?, ?, ?)',
            [dDate, poolAmount, 'proportional_lifetime', req.admin.username, req.admin.username]);
        
        for (const m of members) {
            const payout = poolAmount * (m.totalContrib / totalSystemContribs);
            if (payout > 0) {
                const ref = \`DIV-\${r.lastID}-\${m.id}\`;
                const pr = await dbRun(
                    \`INSERT INTO payments (memberId, amount, paymentDate, reference, note, status) VALUES (?, ?, ?, ?, ?, 'completed')\`,
                    [m.id, payout, dDate, ref, 'Annual Dividend Distribution']
                );
                await dbRun(
                    \`INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, payment_id) VALUES ('credit', ?, ?, ?, ?, ?, ?)\`,
                    [payout, \`Dividend payout to \${m.name}\`, req.admin.username, dDate, ref, pr.lastID]
                );
            }
        }
        logActivity('Dividend Distributed', 'Dividend', r.lastID, \`Distributed KES \${poolAmount}\`, req.admin.username);
        res.json({ message: 'Dividends successfully distributed.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
`;

const updated = content.replace('app.listen(PORT, () => console.log(`✅  Server running on http://localhost:${PORT}`));', newCode + '\napp.listen(PORT, () => console.log(`✅  Server running on http://localhost:${PORT}`));');
fs.writeFileSync('index.js', updated);
console.log('Appended successfully');
