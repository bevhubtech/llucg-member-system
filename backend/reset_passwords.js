const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const newPassword = 'password123';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(newPassword, salt);

console.log(`--- EMERGENCY PASSRESET UTILITY ---`);
console.log(`New Hash: ${hash}`);

const usersToReset = ['admin', 'ict_admin_test'];

db.serialize(() => {
    usersToReset.forEach(user => {
        db.run(
            'UPDATE admin_users SET password_hash = ?, must_change_password = 0 WHERE username = ?',
            [hash, user],
            function(err) {
                if (err) {
                    console.error(`[ERROR] Failed to reset ${user}:`, err.message);
                } else {
                    console.log(`[SUCCESS] Reset ${user} (${this.changes} row updated)`);
                }
            }
        );
    });
});

db.close((err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('--- EMERGENCY RESET COMPLETE ---');
});
