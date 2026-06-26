const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

db.all('SELECT id, username, role FROM admins', [], (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('Admins:', rows);
    db.close();
});
