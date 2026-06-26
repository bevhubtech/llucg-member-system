const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memberId INTEGER NOT NULL,
        amount REAL NOT NULL,
        phone TEXT NOT NULL,
        checkoutRequestId TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        allocations TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error(err.message);
            process.exit(1);
        } else {
            console.log('mpesa_transactions table created successfully.');
            process.exit(0);
        }
    });
});
