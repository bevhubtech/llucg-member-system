const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log(`Migrating database at ${dbPath}...`);

db.serialize(() => {
    // Check if column exists
    db.all("PRAGMA table_info(member_documents)", (err, rows) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        const exists = rows.some(r => r.name === 'status');
        if (!exists) {
            db.run("ALTER TABLE member_documents ADD COLUMN status TEXT DEFAULT 'active'", (err) => {
                if (err) {
                    console.error('Error adding status column:', err);
                    process.exit(1);
                }
                console.log('Added "status" column to member_documents.');
                process.exit(0);
            });
        } else {
            console.log('"status" column already exists.');
            process.exit(0);
        }
    });
});
