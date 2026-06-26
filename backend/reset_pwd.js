const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
const hash = bcrypt.hashSync('admin123', 10);
db.run('UPDATE admin_users SET password_hash = ? WHERE username = "secretary"', [hash], (err) => {
    if (err) console.error(err);
    else console.log('Password reset successfully for user: secretary');
    db.close();
});
