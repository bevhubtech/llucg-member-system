const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, (err) => err ? rej(err) : res()));

async function migrate() {
    console.log('--- Migrating Settings ---');
    try {
        await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('penalty_grace_period', '7')");
        await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('penalty_sms_enabled', 'true')");
        console.log('✓ Successfully ensured penalty_grace_period and penalty_sms_enabled settings.');
    } catch (e) { console.error('Migration failed:', e.message); }
    db.close();
}

migrate();
