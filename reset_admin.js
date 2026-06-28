const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Resolve path to the database file (relative to this script location)
const dbPath = path.resolve(__dirname, '..', 'backend', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const username = 'admin';
const plainPassword = '123456';
const hashed = bcrypt.hashSync(plainPassword, 10);

function upsertAdmin(cb) {
  db.get('SELECT id FROM admin_users WHERE username = ?', [username], (err, row) => {
    if (err) return cb(err);
    if (row) {
      // Update existing admin's password_hash and clear lockouts
      db.run('UPDATE admin_users SET password_hash = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ?', [hashed, row.id], cb);
    } else {
      // Insert new admin (role defaults to superadmin for full access)
      db.run('INSERT INTO admin_users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 0)', [username, hashed, 'superadmin'], cb);
    }
  });
}

upsertAdmin((err) => {
  if (err) {
    console.error('Error upserting admin user:', err);
    process.exit(1);
  } else {
    console.log('Admin user ensured with username="admin" and password="123456"');
    process.exit(0);
  }
});
