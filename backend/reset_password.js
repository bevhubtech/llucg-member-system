const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const username = 'dev_admin';
const newPassword = '123456';
const salt = 10;

bcrypt.hash(newPassword, salt, (err, hash) => {
    if (err) {
        console.error('Bcrypt Error:', err);
        process.exit(1);
    }
    
    db.run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [hash, username], function(updateErr) {
        if (updateErr) {
            console.error('Database Update Error:', updateErr.message);
        } else if (this.changes === 0) {
            console.log(`User "${username}" not found. Creating it instead...`);
            db.run('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, 'superadmin'], (insertErr) => {
                if (insertErr) console.error('Insert Error:', insertErr.message);
                else console.log(`User "${username}" created with password "${newPassword}"`);
                db.close();
            });
        } else {
            console.log(`Password for "${username}" has been reset to "${newPassword}"`);
            db.close();
        }
    });
});
