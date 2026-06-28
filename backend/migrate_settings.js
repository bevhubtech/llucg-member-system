const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, (err) => err ? rej(err) : res()));

async function migrate() {
    console.log('--- Migrating Settings ---');
    try {
        // Add title column if missing
        await dbRun('ALTER TABLE settings ADD COLUMN title TEXT');
        // Ensure defaults for contribution and welfare
        await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('contribution_target', '1000')");
        await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('welfare_contribution_amount', '100')");
        // Existing penalty defaults
        await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('penalty_grace_period', '7')");
        await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('penalty_sms_enabled', 'true')");
        console.log('✓ Migration completed: title column added and defaults set.');
        
    } catch (e) { console.error('Migration failed:', e.message); }
    db.close();
}

migrate();
