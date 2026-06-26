const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // 1. Create a mock meeting and resolution
    db.run(`INSERT INTO meetings (title, date, location, notes, created_at, agenda, minutes) 
            VALUES ('AGM 2026', '2026-03-15', 'Community Hall', 'Focus on 2026 growth', '2026-03-15', 'Review 2025 results', 'The group agreed to increase monthly contributions to KES 5,000.')`);
    
    db.run(`INSERT INTO meeting_resolutions (meetingId, resolution, proposedBy, status, timestamp) 
            VALUES (1, 'Contribution target increased to KES 5,000 effective April.', 'Treasurer', 'passed', '2026-03-15')`);

    // 2. Create a mock loan and guarantor request
    // First, find a member id other than the test user (111222333)
    db.get("SELECT id FROM members WHERE phone != '111222333' LIMIT 1", (err, otherMember) => {
        if (otherMember) {
            db.get("SELECT id FROM members WHERE phone = '111222333'", (err, testUser) => {
                if (testUser) {
                    db.run(`INSERT INTO loans (memberId, amount, interestRate, disbursedDate, dueDate, status) 
                            VALUES (?, 50000, 5, '2026-04-01', '2026-07-01', 'pending')`, [otherMember.id], function(err) {
                        const loanId = this.lastID;
                        db.run(`INSERT INTO loan_guarantors (loanId, memberId, amount, status) 
                                VALUES (?, ?, 10000, 'pending')`, [loanId, testUser.id]);
                    });
                }
            });
        }
    });
});
