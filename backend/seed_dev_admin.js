const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const hash = bcrypt.hashSync('password123', 10);
db.run('INSERT OR REPLACE INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)', 
    ['dev_admin', hash, 'superadmin'], (err) => {
        if (err) console.error(err.message);
        else console.log('Seeded dev_admin with role superadmin');
        db.close();
    });
