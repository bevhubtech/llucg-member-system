const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);
db.run("UPDATE admin_users SET must_change_password = 1;", [], (err) => {
    if (err) console.error(err);
    else console.log("All admin accounts flagged for mandatory password reset.");
    db.close();
});
