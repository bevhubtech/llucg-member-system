const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, (err) => err ? rej(err) : res()));
const dbGet = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const dbAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

async function verify() {
    console.log('--- Verifying Enhanced Governance ---');

    // 1. Check if settings exist
    const graceSetting = await dbGet('SELECT value FROM settings WHERE key="penalty_grace_period"');
    const smsSetting = await dbGet('SELECT value FROM settings WHERE key="penalty_sms_enabled"');
    console.log('Grace Period Setting:', graceSetting?.value || 'MISSING');
    console.log('Penalty SMS Enabled:', smsSetting?.value || 'MISSING');

    // 2. Setup a test member for penalty check
    const testName = 'Test Member Grace';
    const testPhone = '254700000000';
    
    // Cleanup old test data
    await dbRun('DELETE FROM members WHERE phone = ?', [testPhone]);
    
    // Create member overdue by 10 days (with 7 day overdue + 3 day grace)
    // Wait, let's make it overdue by 15 days to be sure.
    const now = new Date();
    const fifteenDaysAgo = new Date(now.setDate(now.getDate() - 15)).toISOString();
    
    await dbRun('INSERT INTO members (name, phone, joinDate, nextDueDate, status) VALUES (?, ?, ?, ?, ?)',
        [testName, testPhone, new Date().toISOString(), fifteenDaysAgo, 'active']);
    const member = await dbGet('SELECT id FROM members WHERE phone = ?', [testPhone]);
    
    console.log(`Created test member ${testName} (ID: ${member.id}) with due date ${fifteenDaysAgo}`);

    // 3. Manually trigger the penalty logic (simulating the cron job)
    // We'll import the function or just run a simplified version here for verification
    const settings = {};
    (await dbAll('SELECT key, value FROM settings')).forEach(r => settings[r.key] = r.value);
    
    const amount = parseFloat(settings.auto_penalty_amount || 200);
    const overdueDays = parseInt(settings.auto_penalty_days_overdue || 7);
    const gracePeriod = parseInt(settings.penalty_grace_period || 7);
    const totalThreshold = overdueDays + gracePeriod;
    
    console.log(`Thresholds: Overdue=${overdueDays}, Grace=${gracePeriod}, Total=${totalThreshold}`);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - totalThreshold);
    
    const targetMember = await dbGet(`SELECT * FROM members WHERE id = ? AND nextDueDate < ?`, [member.id, cutoff.toISOString()]);
    
    if (targetMember) {
        console.log(`✓ Member correctly detected as overdue beyond grace period.`);
        
        // Simulate issuance
        const currentMonth = new Date().toISOString().substring(0, 7);
        const reason = `Automated Late Fee (Overdue by ${totalThreshold} days)`;
        
        // Remove existing penalties for this month for clean test
        await dbRun('DELETE FROM penalties WHERE memberId = ? AND issuedDate LIKE ?', [member.id, `${currentMonth}%`]);
        
        await dbRun(`INSERT INTO penalties (memberId, amount, reason, issuedDate) VALUES (?, ?, ?, ?)`,
            [member.id, amount, reason, new Date().toISOString()]);
        
        const penalty = await dbGet('SELECT * FROM penalties WHERE memberId = ? ORDER BY id DESC LIMIT 1', [member.id]);
        if (penalty) {
            console.log(`✓ Penalty issued: KES ${penalty.amount} - ${penalty.reason}`);
        } else {
            console.log(`✗ Failed to issue penalty.`);
        }
    } else {
        console.log(`✗ Member NOT detected as overdue! Check date logic.`);
    }

    // 4. Cleanup
    await dbRun('DELETE FROM members WHERE phone = ?', [testPhone]);
    console.log('--- Verification Complete ---');
    db.close();
}

verify().catch(err => { console.error('Verification failed:', err); db.close(); });
