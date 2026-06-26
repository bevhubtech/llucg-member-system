const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Starting loan interest migration...');

    db.all("SELECT * FROM loans WHERE status = 'active'", (err, rows) => {
        if (err) {
            console.error('Error fetching loans:', err.message);
            return;
        }

        console.log(`Found ${rows.length} active loans to migrate.`);

        rows.forEach(loan => {
            // Only migrate if not already migrated (originalPrincipal is null)
            if (loan.originalPrincipal === null || loan.originalPrincipal === undefined) {
                const principal = loan.amount;
                const tenure = loan.tenure || 1;
                const rate = loan.interestRate || 0;
                const totalInterest = principal * (rate / 100) * tenure;
                const newAmount = principal + totalInterest;

                console.log(`Migrating Loan #${loan.id}: Principal ${principal} -> Total ${newAmount} (Interest: ${totalInterest})`);

                db.run(
                    "UPDATE loans SET amount = ?, originalPrincipal = ?, totalInterest = ? WHERE id = ?",
                    [newAmount, principal, totalInterest, loan.id],
                    (updErr) => {
                        if (updErr) console.error(`Error updating loan ${loan.id}:`, updErr.message);
                    }
                );
            } else {
                console.log(`Loan #${loan.id} already migrated.`);
            }
        });
    });
});

setTimeout(() => {
    db.close();
    console.log('Migration complete.');
}, 3000);
