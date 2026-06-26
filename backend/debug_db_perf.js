const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.get('SELECT COUNT(*) as c FROM admin_sessions', (err, row) => {
        console.log('Admin Sessions Count:', row?.c || 0);
    });
    db.get('SELECT COUNT(*) as c FROM member_sessions', (err, row) => {
        console.log('Member Sessions Count:', row?.c || 0);
    });
    db.get('SELECT COUNT(*) as c FROM activity_log', (err, row) => {
        console.log('Activity Log Count:', row?.c || 0);
    });
    db.all('PRAGMA index_list(admin_sessions)', (err, rows) => {
        console.log('Admin Sessions Indexes:', rows);
    });
    db.all('PRAGMA index_list(member_sessions)', (err, rows) => {
        console.log('Member Sessions Indexes:', rows);
    });
});
db.close();
