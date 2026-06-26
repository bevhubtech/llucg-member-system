const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Flag members without a password_hash (default PIN 1234)
    db.run("UPDATE members SET must_change_password = 1 WHERE password_hash IS NULL", function(err) {
        if (err) console.error(err);
        else console.log(`Flagged ${this.changes} members for mandatory password reset.`);
    });
    
    // Also flag members who have a password_hash that is very short (though bcrypt hashes are long, better safe than sorry if we had some plain text pins)
    // But bcrypt hashes are always 60 chars.
});

db.close();
