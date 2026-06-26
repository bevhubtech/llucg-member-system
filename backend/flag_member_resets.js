const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('--- Member Password Reset Migration ---');

db.serialize(() => {
    // 1. Ensure the column exists (secondary check, database.js already does this)
    db.run(`ALTER TABLE members ADD COLUMN must_change_password INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding column:', err.message);
        }
    });

    // 2. Identify members with no password_hash (default pin users)
    db.all("SELECT id, name, phone, password_hash FROM members WHERE password_hash IS NULL", (err, rows) => {
        if (err) {
            console.error('Error fetching members:', err.message);
            return;
        }

        if (rows.length === 0) {
            console.log('No members found with default PINs (all have password hashes).');
        } else {
            console.log(`Found ${rows.length} members with default PINs.`);
            
            const ids = rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            
            db.run(`UPDATE members SET must_change_password = 1 WHERE id IN (${placeholders})`, ids, function(err2) {
                if (err2) {
                    console.error('Error updating members:', err2.message);
                } else {
                    console.log(`Successfully flagged ${this.changes} members for mandatory password reset.`);
                }
            });
        }
        
        // 3. Special case: If password_hash exists but they chose '1234' (unlikely since we didn't have hashes before, but good for completeness)
        // In this system, password_hash only exists if they changed it away from 1234 already.
    });
});

db.close();
