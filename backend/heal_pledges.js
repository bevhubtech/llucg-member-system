const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('--- Database Healer: Pledge Fee Truncation ---');

db.serialize(() => {
    db.all("SELECT * FROM penalties WHERE reason LIKE 'Pledge Fee %'", async (err, rows) => {
        if (err) {
            console.error('Error fetching penalties:', err.message);
            return;
        }
        
        console.log(`Analyzing ${rows.length} penalty records...`);
        let fixedCount = 0;

        for (const row of rows) {
            // Try to find a corresponding pledge record to get the full, non-truncated targetDate
            const pledge = await new Promise((resolve) => {
                // Try matching by penaltyId first (the most reliable way)
                db.get("SELECT targetDate FROM pledges WHERE penaltyId = ?", [row.id], (err, p) => {
                    if (p) return resolve(p);
                    
                    // Fallback: match by memberId and approximate date if penaltyId missing in older records
                    const dateDay = row.issuedDate.split('T')[0];
                    db.get("SELECT targetDate FROM pledges WHERE memberId = ? AND timestamp LIKE ? LIMIT 1", 
                        [row.memberId, `${dateDay}%`], (err, p2) => {
                        resolve(p2);
                    });
                });
            });

            if (pledge && pledge.targetDate) {
                const fullDate = pledge.targetDate.split('T')[0];
                const newReason = `Pledge: Grace until ${fullDate}`;
                
                db.run("UPDATE penalties SET reason = ? WHERE id = ?", [newReason, row.id], (updErr) => {
                    if (!updErr) {
                        console.log(`✓ Fixed Penalty #${row.id}:`);
                        console.log(`  OLD: "${row.reason}"`);
                        console.log(`  NEW: "${newReason}"`);
                    }
                });
                fixedCount++;
            } else {
                console.log(`! Could not find original date for Penalty #${row.id} ("${row.reason}")`);
            }
        }
        
        // Final summary (delayed to ensure db operations finished)
        setTimeout(() => {
            console.log('\n--- Healing Process Complete ---');
            console.log(`Total records updated: ${fixedCount}`);
            db.close();
        }, 1000);
    });
});
