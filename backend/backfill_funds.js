const db = require('./database');
const dbRun = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => e ? rej(e) : res()));
const dbAll = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

async function backfill() {
    console.log('Starting retroactive fund categorization...');
    
    // 1. Savings/Contributions
    await dbRun("UPDATE transactions SET fund = 'Member Savings' WHERE description LIKE '%Savings%' OR description LIKE '%Contribution%' OR description LIKE '%Share Capital%'");
    
    // 2. Welfare
    await dbRun("UPDATE transactions SET fund = 'Welfare Fund' WHERE description LIKE '%Welfare%'");
    
    // 3. Reserves
    await dbRun("UPDATE transactions SET fund = 'Institutional Reserves' WHERE description LIKE '%Registration%' OR description LIKE '%Penalty%' OR description LIKE '%Fine%' OR description LIKE '%Reg Fee%'");
    
    // 4. Personal
    await dbRun("UPDATE transactions SET fund = 'Personal Savings' WHERE description LIKE '%Personal Savings%' OR description LIKE '%Personal%'");

    // 5. Categorize existing loans
    await dbRun("UPDATE loans SET fundingSource = 'Member Savings' WHERE fundingSource IS NULL");
    
    console.log('Backfill complete.');
    process.exit(0);
}

backfill();
