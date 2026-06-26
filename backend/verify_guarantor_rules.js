const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));

async function test() {
    console.log("--- TESTING SMART GUARANTOR RULES ---");
    
    // 1. Setup a member with an unpaid penalty
    await dbRun("UPDATE penalties SET paidStatus='unpaid' WHERE memberId=1 LIMIT 1");
    console.log("Set member 1 to have an unpaid penalty.");

    // 2. Try to validate as guarantor (expect failure)
    try {
        const member = await dbGet('SELECT name, joinDate FROM members WHERE id=1');
        const unpaidPen = await dbGet("SELECT COUNT(*) as c FROM penalties WHERE memberId=1 AND paidStatus='unpaid'");
        if (unpaidPen.c > 0) throw new Error(`${member.name} has unpaid penalties and cannot guarantee.`);
        console.log("FAIL: Member 1 should have been blocked due to penalties.");
    } catch (e) {
        console.log("SUCCESS: Blocked as expected: " + e.message);
    }

    // 3. Setup a member with no contributions (in arrears)
    await dbRun("DELETE FROM payments WHERE memberId=2");
    console.log("Cleared payments for member 2.");

    try {
        const member = await dbGet('SELECT name, joinDate FROM members WHERE id=2');
        const targetRow = await dbGet("SELECT value FROM settings WHERE key='contribution_target'");
        const target    = parseFloat(targetRow?.value || 0);
        const monthsActive = Math.round((new Date() - new Date(member.joinDate)) / (1000*60*60*24*30));
        const paidRow   = await dbGet("SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE memberId=2 AND status='completed'");
        
        if (paidRow.t < (target * monthsActive)) throw new Error(`${member.name} is in arrears and cannot guarantee.`);
        console.log("FAIL: Member 2 should have been blocked due to arrears.");
    } catch (e) {
        console.log("SUCCESS: Blocked as expected: " + e.message);
    }

    db.close();
}

test();
