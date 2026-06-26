const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

db.all("SELECT * FROM org_documents", [], (err, rows) => {
    console.log("ORG_DOCS:", rows.length);
    if(rows.length > 0) console.log(rows[0]);
    db.all("SELECT * FROM member_documents", [], (err2, rows2) => {
        console.log("MEMBER_DOCS:", rows2.length);
        db.close();
    });
});
