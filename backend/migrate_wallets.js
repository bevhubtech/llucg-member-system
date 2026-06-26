const db = require('./database');

db.serialize(() => {
    // 1. Update payments table
    db.run("UPDATE payments SET walletType = 'SACCO Savings' WHERE walletType = 'Share Capital' OR walletType IS NULL", function(err) {
        if (err) console.error('Error updating payments:', err.message);
        else console.log(`Updated ${this.changes} payments to SACCO Savings.`);
    });

    // 2. Update transactions table
    db.run("UPDATE transactions SET description = REPLACE(description, 'Share Capital', 'SACCO Savings') WHERE description LIKE '%Share Capital%'", function(err) {
        if (err) console.error('Error updating transactions:', err.message);
        else console.log(`Updated ${this.changes} transactions to SACCO Savings.`);
    });
});
