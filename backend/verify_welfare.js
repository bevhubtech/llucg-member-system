const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve('c:\\Users\\odero\\.gemini\\antigravity\\scratch\\member_system\\backend\\database.sqlite');
const db = new sqlite3.Database(dbPath);

async function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function verify() {
    console.log('--- Verifying Welfare Segregation ---');
    
    // 1. Check if any member has 1100 in savings and if it would be filtered now
    // (Simulating the logic in memberPortal.js)
    const memberId = 1; // Assuming member 1 exists
    
    console.log('\nTesting Savings Query (Should exclude Welfare):');
    const sql = "SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE status='completed' AND walletType NOT IN ('Registration Fee', 'Penalty', 'Welfare Fund', 'Welfare')";
    const res = await runQuery(sql);
    console.log('Savings Total (Filtered):', res[0].t);

    console.log('\nTesting Welfare Query:');
    const sqlW = "SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE type='WELFARE'";
    const resW = await runQuery(sqlW);
    console.log('Welfare Total:', resW[0].t);

    db.close();
}

verify().catch(console.error);
