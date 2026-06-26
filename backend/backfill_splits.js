const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

db.serialize(() => {
    db.all("SELECT * FROM transactions WHERE amount = 1100", [], (err, rows) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        console.log("FOUND:", rows.length);
        
        rows.forEach(row => {
            console.log(`Splitting TX ID ${row.id}: ${row.description}`);
            
            // 1. Delete original
            db.run("DELETE FROM transactions WHERE id = ?", [row.id]);
            
            // 2. Insert Savings (1000)
            db.run("INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('credit', 1000, ?, ?, ?, ?)",
                [`Monthly Savings from ${row.description.split('from ')[1] || 'Member'}`, row.performed_by, row.timestamp, row.reference]);
            
            // 3. Insert Welfare (100)
            db.run("INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('credit', 100, ?, ?, ?, ?)",
                [`Monthly Welfare from ${row.description.split('from ')[1] || 'Member'}`, row.performed_by, row.timestamp, row.reference]);
        });
        
        console.log("Split complete.");
    });
});
