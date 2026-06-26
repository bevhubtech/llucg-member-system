const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');

db.all('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 1', (err, rows) => {
    if (err) console.error('Notifications table error:', err);
    else console.log('Recent Notification:', rows);
});

db.close();
