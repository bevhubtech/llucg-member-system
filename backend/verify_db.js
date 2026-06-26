const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

db.all('PRAGMA table_info(sms_log)', [], (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(JSON.stringify(rows, null, 2));
    
    // Insert mock log
    const details = JSON.stringify([{ number: '+254700000000', status: 'Rejected', failureReason: 'User In Dnd', cost: '0.00' }]);
    db.run(
        `INSERT INTO sms_log (type, recipients, message, status, details, timestamp) VALUES (?,?,?,?,?,?)`,
        ['security_reset', '["+254700000000"]', 'Mock OTP Message', 'failed', details, new Date().toISOString()],
        function(err) {
            if (err) console.error('Insert error:', err);
            else console.log('Mock log inserted with ID:', this.lastID);
            db.close();
        }
    );
});
