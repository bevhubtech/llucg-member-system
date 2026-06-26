const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all('SELECT username FROM admin_users LIMIT 1', [], (err, rows) => {
        if (err) {
            console.log('Admin Query Error:', err.message);
        } else {
            console.log('ADMIN_USER:', rows[0]?.username);
        }
    });

    db.all('SELECT phone, name FROM members LIMIT 1', [], (err, rows) => {
        if (err) {
            console.log('Member Query Error:', err.message);
        } else {
            console.log('MEMBER_PHONE:', rows[0]?.phone);
            console.log('MEMBER_NAME:', rows[0]?.name);
        }
    });
});

db.close();
