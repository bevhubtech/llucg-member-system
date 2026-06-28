const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./database.sqlite');
const username = 'admin';
const plainPassword = '123456';
const hashed = bcrypt.hashSync(plainPassword, 10);
function upsertAdmin(cb) {
  db.get('SELECT id FROM admin_users WHERE username = ?', [username], (err, row) => {
    if (err) return cb(err);
    if (row) {
      db.run('UPDATE admin_users SET password_hash = ?, locked_until = NULL, failed_attempts = 0 WHERE id = ?', [hashed, row.id], cb);
    } else {
      db.run('INSERT INTO admin_users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 0)', [username, hashed, 'superadmin'], cb);
    }
  });
}
upsertAdmin((err) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  } else {
    console.log('Success');
    process.exit(0);
  }
});
