const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('--- SACCO Data Normalization Migration ---');

db.serialize(() => {
    // 1. Update legacy 'Savings' to 'SACCO Savings'
    db.run("UPDATE payments SET walletType = 'SACCO Savings' WHERE walletType = 'Savings'", function(err) {
        if (err) console.error('Error updating Savings:', err.message);
        else console.log(`Normalized ${this.changes} records from 'Savings' to 'SACCO Savings'.`);
    });

    // 2. Update legacy 'Share Capital' to 'SACCO Savings'
    db.run("UPDATE payments SET walletType = 'SACCO Savings' WHERE walletType = 'Share Capital'", function(err) {
        if (err) console.error('Error updating Share Capital:', err.message);
        else console.log(`Normalized ${this.changes} records from 'Share Capital' to 'SACCO Savings'.`);
    });

    // 3. Ensure all completed payments without a type default to 'SACCO Savings'
    db.run("UPDATE payments SET walletType = 'SACCO Savings' WHERE walletType IS NULL OR walletType = ''", function(err) {
        if (err) console.error('Error updating empty types:', err.message);
        else console.log(`Normalized ${this.changes} records with missing wallet types.`);
    });

    // 4. Update shorthand 'Personal' to 'Personal Savings'
    db.run("UPDATE payments SET walletType = 'Personal Savings' WHERE walletType = 'Personal'", function(err) {
        if (err) console.error('Error updating Personal:', err.message);
        else console.log(`Normalized ${this.changes} records from 'Personal' to 'Personal Savings'.`);
    });

    // 5. Final check
    db.all("SELECT walletType, COUNT(*) as count, SUM(amount) as total FROM payments GROUP BY walletType", (err, rows) => {
        if (err) console.error(err);
        else {
            console.log('\n--- Migration Results (Current Distribution) ---');
            console.table(rows);
            console.log('\nMigration complete. All financial records are now standardized.');
        }
        db.close();
    });
});
