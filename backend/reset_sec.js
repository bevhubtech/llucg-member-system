const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);
const hash = bcrypt.hashSync('123456', 10);
db.run("UPDATE admin_users SET password_hash = ? WHERE username = 'secretary'", [hash], (err) => {
    if (err) console.error(err);
    else console.log("Secretary password reset to 123456.");
    db.close();
});
