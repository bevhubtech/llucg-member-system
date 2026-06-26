const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Patching loan_guarantors table...');
    db.run(`ALTER TABLE loan_guarantors ADD COLUMN timestamp TEXT`, () => {});
    db.run(`ALTER TABLE loan_guarantors ADD COLUMN responseTimestamp TEXT`, () => {});
    db.run(`ALTER TABLE loan_guarantors ADD COLUMN amount REAL DEFAULT 0`, () => {});
    console.log('Patch complete.');
});

db.close();
