const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, './database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
});

async function runFix() {
    try {
        console.log("--- STARTING DATA REPAIR FOR CLOSED MEMBERS ---");
        
        const closedMembers = await dbAll("SELECT id, name, membershipNumber FROM members WHERE status = 'closed'");
        console.log(`Found ${closedMembers.length} closed members.`);

        for (const member of closedMembers) {
            console.log(`Checking member: ${member.name} (${member.id})`);
            
            const balances = await dbAll(
                "SELECT type, SUM(amount) as balance FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL', 'PERSONAL') GROUP BY type",
                [member.id]
            );

            let totalToPayout = 0;
            const now = new Date().toISOString();

            for (const bal of balances) {
                if (bal.balance > 0) {
                    console.log(`  Zeroing out ${bal.type} balance: ${bal.balance}`);
                    totalToPayout += bal.balance;
                    
                    await dbRun(
                        "INSERT INTO ledger (memberId, type, amount, description, source, date) VALUES (?, ?, ?, 'REPAIR: Settlement Payout', 'system', ?)",
                        [member.id, bal.type, -bal.balance, now]
                    );
                }
            }

            if (totalToPayout > 0) {
                const existingPayout = await dbGet("SELECT id FROM payments WHERE memberId = ? AND walletType = 'Savings Settlement' AND amount < 0", [member.id]);
                
                if (!existingPayout) {
                    console.log(`  Recording settlement record: ${totalToPayout}`);
                    
                    // Transaction Log
                    await dbRun(
                        "INSERT INTO transactions (type, amount, description, performed_by, timestamp) VALUES ('debit', ?, ?, 'System Repair', ?)",
                        [totalToPayout, `REPAIR: Settlement Payout for ${member.name}`, now]
                    );
                    
                    // Payments Table (Source for Dashboard Capital)
                    await dbRun(
                        "INSERT INTO payments (memberId, amount, paymentDate, status, reference, walletType, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [member.id, -totalToPayout, now.split('T')[0], 'completed', `FIX-${member.id}`, 'Savings Settlement', 'Automated data alignment for closed account']
                    );
                    console.log(`  Success: Settlement recorded.`);
                } else {
                    console.log(`  Note: Payment record already exists.`);
                }
            } else {
                console.log("  Status: No outstanding balance.");
            }
        }

        console.log("--- REPAIR COMPLETE ---");
    } catch (e) {
        console.error("Repair failed:", e);
    } finally {
        db.close();
    }
}

runFix();
