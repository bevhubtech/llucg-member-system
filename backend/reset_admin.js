const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const username = 'admin';
const newPassword = 'password123';
const hash = bcrypt.hashSync(newPassword, 10);

db.serialize(() => {
    db.run("UPDATE admin_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE username = ?", [hash, username], function(err) {
        if (err) {
            console.error('Error updating admin:', err.message);
        } else if (this.changes === 0) {
            // Try creating it if it doesn't exist
            db.run("INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, 'superadmin')", [username, hash], (err2) => {
                if (err2) console.error('Error creating admin:', err2.message);
                else console.log('Created admin user with password: ' + newPassword);
            });
        } else {
            console.log('Reset admin password to: ' + newPassword);
        }
        db.close();
    });
});
