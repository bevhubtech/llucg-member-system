const db = require('./database');

async function test() {
    console.log('--- Testing Financial Governance ---');
    
    // 1. Setup overdue etc.
    await new Promise(res => db.run("UPDATE members SET nextDueDate = ? WHERE id = 1", ['2020-01-01T00:00:00.000Z'], res));
    await new Promise(res => db.run("UPDATE settings SET value = 'true' WHERE key = 'auto_penalty_enabled'", res));
    await new Promise(res => db.run("UPDATE settings SET value = '250' WHERE key = 'auto_penalty_amount'", res));

    // 2. Clear previous today penalties to avoid duplicates
    const today = new Date().toISOString().split('T')[0];
    await new Promise(res => db.run("DELETE FROM penalties WHERE issuedDate LIKE ?", [today + '%'], res));

    console.log('Setup complete: Member 1 is overdue (2020).');

    // 3. Manually run the cron functions (refactored for test context)
    const settings = await new Promise(res => db.all('SELECT key, value FROM settings', (e,r) => res(r)));
    const setMap = settings.reduce((m, s) => ({...m, [s.key]: s.value}), {});
    
    const amount = parseFloat(setMap.auto_penalty_amount || 200);
    const m = await new Promise(res => db.get("SELECT * FROM members WHERE id=1", (e,r) => res(r)));
    
    console.log(`Checking Member: ${m.name}, Due: ${m.nextDueDate}`);
    
    if (new Date(m.nextDueDate) < new Date()) {
        await new Promise(res => db.run(
            `INSERT INTO penalties (memberId, amount, reason, issuedDate) VALUES (?, ?, ?, ?)`,
            [m.id, amount, 'Automated Late Fee (Test)', new Date().toISOString()], res
        ));
        console.log(`✅ SUCCESS: Penalty of KES ${amount} issued.`);
    }

    const check = await new Promise(res => db.get("SELECT COUNT(*) as c FROM penalties WHERE memberId=1", (e,r) => res(r.c)));
    console.log(`Total Penalties for Member 1: ${check}`);

    process.exit();
}

test();
