const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.serialize(() => {
    db.run('DROP TABLE IF EXISTS withdrawals');
    db.run('DROP TABLE IF EXISTS mpesa_b2c_transactions');
    console.log('Tables dropped successfully.');
});
db.close();
