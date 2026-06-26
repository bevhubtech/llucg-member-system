const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("Applying schema changes...");
db.serialize(() => {
    db.run(`ALTER TABLE members ADD COLUMN must_change_password INTEGER DEFAULT 0`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log("Column must_change_password already exists.");
            } else {
                console.error("Error adding column:", err.message);
            }
        } else {
            console.log("Column must_change_password added successfully.");
        }
    });
});

db.close();
