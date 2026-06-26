const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

db.all('PRAGMA table_info(members)', [], (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('Columns:', rows.map(r => r.name));
    
    db.all('SELECT id, phone, status, must_change_password FROM members WHERE phone = ?', ['254711223344'], (err, members) => {
        if (err) { console.error(err); process.exit(1); }
        console.log('Member state:', members);
        
        if (members.length > 0) {
            db.run('UPDATE members SET status = ?, must_change_password = ? WHERE phone = ?', ['active', 1, '254711223344'], (err) => {
                if (err) console.error('Update error:', err);
                else console.log('Member set to active and must_change_password set to 1');
                db.close();
            });
        } else {
            console.log('Member not found');
            db.close();
        }
    });
});
