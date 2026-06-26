const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(err){ err ? rej(err) : res(this); }));
const dbGet = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const dbAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

const normalizePhone = (p) => {
    if (!p) return '';
    let s = p.toString().replace(/\D/g, '');
    if (s.startsWith('0')) s = '254' + s.substring(1);
    if (s.length === 9) s = '254' + s;
    return s;
};

async function verify() {
    console.log('--- Verifying M-Pesa Reconciliation ---');

    // 1. Setup Test Member
    const phone = '0712345678';
    const normPhone = normalizePhone(phone);
    await dbRun('DELETE FROM members WHERE phone = ?', [phone]);
    const res = await dbRun('INSERT INTO members (name, phone, joinDate, nextDueDate, status) VALUES (?, ?, ?, ?, ?)',
        ['Alice Reconcile', phone, new Date().toISOString(), new Date().toISOString(), 'active']);
    const aliceId = res.lastID;
    console.log(`✓ Created test member Alice (ID: ${aliceId}, Phone: ${phone})`);

    // 2. Test Matching Logic (Simulated)
    const mpesaRow = { details: 'MPESA PAID BY 254712345678 ALICE RECONCILE' };
    const phoneMatch = mpesaRow.details.match(/(?:254|\+254|0)?([71][0-9]{8})/);
    const extractedPhone = phoneMatch ? normalizePhone(phoneMatch[0]) : '';
    
    if (extractedPhone === normPhone) {
        console.log(`✓ Matching Logic: Successfully extracted and normalized phone ${extractedPhone}`);
    } else {
        console.error(`✗ Matching Logic: Failed to match phone. Extracted: ${extractedPhone}, Expected: ${normPhone}`);
    }

    // 3. Test Processing Logic
    const testRef = 'REC' + Date.now();
    const amount = 1500;
    
    console.log(`Processing confirmation for Ref: ${testRef}, Amount: ${amount}`);
    
    // Simulate /api/reconcile/confirm
    const member = await dbGet('SELECT * FROM members WHERE id = ?', [aliceId]);
    const ts = new Date().toISOString();
    const pr = await dbRun(
        `INSERT INTO payments (memberId, amount, paymentDate, reference, note, walletType, status) VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
        [aliceId, amount, ts, testRef, 'Reconciled from M-Pesa Test', 'SACCO Savings']
    );

    const payment = await dbGet('SELECT * FROM payments WHERE id = ?', [pr.lastID]);
    if (payment && payment.reference === testRef) {
        console.log(`✓ Payment record created successfully.`);
    } else {
        console.error(`✗ Failed to create payment record.`);
    }

    const transaction = await dbGet('SELECT * FROM transactions WHERE payment_id = ?', [pr.lastID]);
    if (transaction && parseFloat(transaction.amount) === amount) {
        console.log(`✓ Transaction record created successfully.`);
    } else {
        console.error(`✗ Failed to create transaction record.`);
    }

    // 4. Cleanup
    await dbRun('DELETE FROM members WHERE id = ?', [aliceId]);
    await dbRun('DELETE FROM payments WHERE id = ?', [pr.lastID]);
    await dbRun('DELETE FROM transactions WHERE payment_id = ?', [pr.lastID]);
    
    console.log('--- Verification Complete ---');
    db.close();
}

verify().catch(err => { console.error(err); db.close(); });
