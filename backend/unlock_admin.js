const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('database.sqlite');

const hash = bcrypt.hashSync('123456', 10);
db.run('UPDATE admin_users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE username = ?', [hash, 'admin'], (err) => {
    if (err) console.error(err);
    else console.log('Admin account unlocked and password set to 123456');
    db.close();
});
