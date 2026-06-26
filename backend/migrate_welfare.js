const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve('c:\\Users\\odero\\.gemini\\antigravity\\scratch\\member_system\\backend\\database.sqlite');
const db = new sqlite3.Database(dbPath);

async function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function migrate() {
    console.log('--- Migrating 1100 Monthly Contributions ---');
    
    const rows = await all("SELECT * FROM payments WHERE walletType = 'Monthly Contribution' AND amount = 1100");
    console.log(`Found ${rows.length} payments to split.`);

    for (const row of rows) {
        // 1. Update existing to 1000 and change type to 'Savings'
        await run("UPDATE payments SET amount = 1000, walletType = 'Savings' WHERE id = ?", [row.id]);
        
        // 2. Insert new payment for Welfare
        await run("INSERT INTO payments (memberId, amount, walletType, reference, status, paymentDate, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [row.memberId, 100, 'Welfare Fund', row.reference, row.status, row.paymentDate, 'Welfare Split from Monthly Contribution']);
            
        // 3. Also insert into ledger for Welfare
        await run("INSERT INTO ledger (memberId, type, amount, description, source, date, reference) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [row.memberId, 'WELFARE', 100, 'Welfare Contribution (Split)', 'internal', row.paymentDate, row.reference]);
    }

    console.log('Migration complete.');
    db.close();
}

migrate().catch(console.error);
