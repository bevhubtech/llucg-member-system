const db = require('./database');
db.all('SELECT id, name FROM members WHERE id IN (2,4,9)', (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    console.log('Members found:', JSON.stringify(rows, null, 2));
    db.all('SELECT * FROM loan_applications', (err, apps) => {
        if (err) { console.error(err); process.exit(1); }
        console.log('Applications found:', JSON.stringify(apps, null, 2));
        process.exit(0);
    });
});
