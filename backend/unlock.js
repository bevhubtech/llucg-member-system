const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run("UPDATE admin_users SET failed_attempts = 0, locked_until = NULL WHERE username = 'admin'", (err) => {
        if (err) {
            console.error('Error unlocking admin:', err.message);
        } else {
            console.log('Successfully unlocked "admin" account.');
        }
    });

    db.run("UPDATE admin_users SET failed_attempts = 0, locked_until = NULL WHERE username = 'dev_admin'", (err) => {
        if (err) {
            console.error('Error unlocking dev_admin:', err.message);
        } else {
            console.log('Successfully unlocked "dev_admin" account.');
        }
    });
});

db.close();
