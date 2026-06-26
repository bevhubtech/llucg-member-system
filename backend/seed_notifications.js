const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

const now = new Date().toISOString();
db.run(`INSERT INTO notifications (userId, userType, title, message, timestamp) VALUES (?, ?, ?, ?, ?)`, 
    [1, 'admin', 'System Update', 'A new security patch has been applied to the portal.', now], 
    (err) => {
        if (err) console.error(err);
        else console.log('Admin notification created.');
    }
);

db.run(`INSERT INTO notifications (userId, userType, title, message, timestamp) VALUES (?, ?, ?, ?, ?)`, 
    [1, 'member', 'Loan Approved', 'Your loan application #L100 has been approved.', now], 
    (err) => {
        if (err) console.error(err);
        else console.log('Member notification created.');
        db.close();
    }
);
