const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const users = [
    { username: 'secretary', password: 'password123', role: 'secretary' },
    { username: 'finance', password: 'password123', role: 'finance_admin' },
    { username: 'treasurer', password: 'password123', role: 'treasurer' }
];

db.serialize(() => {
    users.forEach(u => {
        const hash = bcrypt.hashSync(u.password, 10);
        db.run('INSERT OR REPLACE INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)', 
            [u.username, hash, u.role], (err) => {
                if (err) console.error(`Error seeding ${u.username}:`, err.message);
                else console.log(`Seeded ${u.username} with role ${u.role}`);
            });
    });
});

db.close();
