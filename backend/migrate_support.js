const db = require('./database');

const sql = `
CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memberId INTEGER NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (memberId) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS support_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticketId INTEGER NOT NULL,
    authorId INTEGER, -- adminId or memberId
    authorType TEXT NOT NULL, -- 'admin' or 'member'
    authorName TEXT,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticketId) REFERENCES support_tickets(id)
);
`;

db.serialize(() => {
    db.exec(sql, (err) => {
        if (err) {
            console.error('Migration Error:', err);
            process.exit(1);
        }
        console.log('Support tables created successfully.');
        process.exit(0);
    });
});
