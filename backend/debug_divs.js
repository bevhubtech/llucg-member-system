const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(dividends)", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('--- DIVIDENDS TABLE SCHEMA ---');
        console.table(rows);
    }
    db.close();
});
