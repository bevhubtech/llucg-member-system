const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, './database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("--- ADMIN USERS ---");
db.all("SELECT id, username, role FROM admin_users", [], (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));

    console.log("\n--- MEMBERS IN PENDING_CLOSURE ---");
    db.all("SELECT id, name, status, membershipNumber FROM members WHERE status = 'pending_closure'", [], (err, rows) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(rows, null, 2));

        console.log("\n--- LEDGER CHECK ---");
        db.all("SELECT type, COUNT(*) as count FROM ledger GROUP BY type", [], (err, rows) => {
            if (err) console.error(err);
            else console.log(JSON.stringify(rows, null, 2));
            db.close();
        });
    });
});
