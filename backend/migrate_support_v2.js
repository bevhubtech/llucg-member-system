const db = require('./database');

const sql = `
ALTER TABLE support_replies ADD COLUMN attachmentUrl TEXT;
`;

db.serialize(() => {
    db.exec(sql, (err) => {
        if (err) {
            // If column already exists, just log and continue
            if (err.message.includes('duplicate column name')) {
                console.log('Column attachmentUrl already exists.');
                process.exit(0);
            }
            console.error('Migration Error:', err);
            process.exit(1);
        }
        console.log('Support tables updated with attachmentUrl.');
        process.exit(0);
    });
});
