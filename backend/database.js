require('dotenv').config();
const sqlite3  = require('sqlite3').verbose();
const bcrypt   = require('bcryptjs');
const path     = require('path');

const fs = require('fs');
const dbDir = fs.existsSync('/data') ? '/data' : __dirname;
const dbPath = path.resolve(dbDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) { console.error('Error opening database', err.message); return; }
    console.log('Connected to SQLite database.');

    db.serialize(() => {
        // Members
        db.run(`CREATE TABLE IF NOT EXISTS members (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            phone       TEXT    NOT NULL UNIQUE,
            joinDate    TEXT    NOT NULL,
            nextDueDate TEXT    NOT NULL,
            status      TEXT    NOT NULL DEFAULT 'active',
            password_hash TEXT,
            membershipNumber TEXT UNIQUE,
            email       TEXT
        )`);
        db.run(`ALTER TABLE members ADD COLUMN registration_fee_paid INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN password_hash TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN email TEXT`, () => {});
        // Add column first without UNIQUE constraint to allow backfill
        db.run(`ALTER TABLE members ADD COLUMN membershipNumber TEXT`, () => {
            // Check if we need to backfill
            db.all("SELECT id FROM members WHERE membershipNumber IS NULL ORDER BY id ASC", (err, rows) => {
                if (!err && rows && rows.length > 0) {
                    let completed = 0;
                    rows.forEach((row) => {
                        const num = (row.id).toString().padStart(3, '0');
                        const idStr = `LLUCG-${num}`;
                        db.run("UPDATE members SET membershipNumber = ? WHERE id = ?", [idStr, row.id], () => {
                            completed++;
                            if (completed === rows.length) {
                                // Once backfilled, add the UNIQUE index
                                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_membershipNumber ON members(membershipNumber)`, () => {
                                    console.log(`Backfilled ${rows.length} membership IDs and created unique index.`);
                                });
                            }
                        });
                    });
                } else {
                    // Even if no backfill, ensure index exists
                    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_membershipNumber ON members(membershipNumber)`);
                }
            });
        });
        db.run(`ALTER TABLE members ADD COLUMN nextOfKinName TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN nextOfKinPhone TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN nextOfKinRelation TEXT`, () => {});
        // Member Security
        db.run(`ALTER TABLE members ADD COLUMN totp_secret TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN totp_enabled INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN totp_method TEXT DEFAULT 'totp'`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN mfa_token TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN must_change_password INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN last_login TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN reset_otp TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN reset_otp_expiry TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN failed_attempts INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN locked_until TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN last_ip TEXT`, () => {});
        // Payments
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId    INTEGER NOT NULL,
            amount      REAL NOT NULL,
            paymentDate TEXT NOT NULL,
            reference   TEXT,
            note        TEXT,
            status      TEXT DEFAULT 'completed',
            walletType  TEXT DEFAULT 'SACCO Savings',
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);
        db.run(`ALTER TABLE payments ADD COLUMN walletType TEXT DEFAULT 'SACCO Savings'`, () => {});
        
        // Member Ledger (Multi-wallet system)
        db.run(`CREATE TABLE IF NOT EXISTS ledger (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId    INTEGER NOT NULL,
            type        TEXT NOT NULL, -- 'PERSONAL', 'SACCO Savings', etc
            amount      REAL NOT NULL,
            description TEXT,
            source      TEXT DEFAULT 'internal',
            reference   TEXT,
            date        TEXT NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        // Fund ledger
        db.run(`ALTER TABLE transactions ADD COLUMN fund TEXT DEFAULT 'General'`, () => {});
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            type         TEXT NOT NULL CHECK(type IN ('credit','debit')),
            amount       REAL NOT NULL,
            description  TEXT NOT NULL,
            performed_by TEXT NOT NULL DEFAULT 'Admin',
            timestamp    TEXT NOT NULL,
            reference    TEXT,
            payment_id   INTEGER,
            fund         TEXT DEFAULT 'General',
            FOREIGN KEY (payment_id) REFERENCES payments(id)
        )`);

        // Admin users
        db.run(`CREATE TABLE IF NOT EXISTS admin_users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'admin',
            email         TEXT
        )`, () => {
            db.run(`ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`, () => {});
            db.get('SELECT COUNT(*) as c FROM admin_users', [], (err, row) => {
                if (!err && row.c === 0) {
                    const username = process.env.ADMIN_USERNAME || 'admin';
                    const plain    = process.env.ADMIN_PASSWORD || '123456';
                    const hash     = bcrypt.hashSync(plain, 10);
                    db.run('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, 'superadmin']);
                    console.log(`Super-admin user "${username}" seeded.`);
                } else if (!err && row.c > 0) {
                    db.get(`SELECT COUNT(*) as c FROM admin_users WHERE role='superadmin'`, [], (e2, r2) => {
                        if (!e2 && r2.c === 0) {
                            db.run(`UPDATE admin_users SET role='superadmin' WHERE id=(SELECT MIN(id) FROM admin_users)`);
                            console.log('Promoted first admin account to superadmin.');
                        }
                    });
                }
            });
        });
        db.run(`ALTER TABLE admin_users ADD COLUMN failed_attempts INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN locked_until TEXT`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN last_ip TEXT`, () => {});

        // SMS log
        db.run(`CREATE TABLE IF NOT EXISTS sms_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            type        TEXT NOT NULL,
            recipients  TEXT NOT NULL,
            message     TEXT NOT NULL,
            status      TEXT DEFAULT 'sent',
            details     TEXT,
            timestamp   TEXT NOT NULL
        )`);
        db.run(`ALTER TABLE sms_log ADD COLUMN details TEXT`, () => {});

        // Activity log
        db.run(`CREATE TABLE IF NOT EXISTS activity_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            action       TEXT NOT NULL,
            entity       TEXT NOT NULL,
            entity_id    TEXT,
            details      TEXT,
            performed_by TEXT DEFAULT 'Admin',
            timestamp    TEXT NOT NULL
        )`);
        db.run(`ALTER TABLE activity_log ADD COLUMN details TEXT`, () => {});

        // ── NEW TABLES ─────────────────────────────────────────────

        // Settings (key-value store)
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )`, () => {
            const defaults = {
                group_name:               'LIFE-LONG UNITY CAPITAL GROUP',
                organization_name:        'LIFE-LONG UNITY CAPITAL GROUP',
                organization_tagline:     'Unity in Prosperity',
                currency:                 'KES',
                contribution_target:      '5000',
                auto_penalty_enabled:     'false',
                auto_penalty_amount:      '200',
                auto_penalty_days_overdue:'7',
                reminder_days_before:     '3',
                reminder_days_after:      '1',
                late_fee_amount:          '200',
                penalty_grace_period:     '7',
                penalty_sms_enabled:      'true',
                absentee_penalty_amount:  '100',
                pledge_fee:               '100',
                pledge_duration:          '14',
                registration_fee_amount:  '500',
                welfare_contribution_amount: '100',
                theme_light_mode:          'false',
                allow_user_theme_toggle:   'false'
            };
            for (const [key, value] of Object.entries(defaults)) {
                db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
                // Also update existing if they are still defaults
                if (key === 'group_name' || key === 'organization_name' || key === 'organization_tagline') {
                    db.run(`UPDATE settings SET value = ? WHERE key = ? AND (value = 'My Chama' OR value = 'CHAMA MANAGEMENT SYSTEM' OR value IS NULL)`, [value, key]);
                }
            }
        });

        // Loans
        db.run(`ALTER TABLE loans ADD COLUMN fundingSource TEXT DEFAULT 'Member Savings'`, () => {});
        db.run(`CREATE TABLE IF NOT EXISTS loans (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId      INTEGER NOT NULL,
            amount        REAL NOT NULL,
            interestRate  REAL NOT NULL DEFAULT 0,
            disbursedDate TEXT NOT NULL,
            dueDate       TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'active',
            notes         TEXT,
            fundingSource TEXT DEFAULT 'Member Savings',
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        // Loan repayments
        db.run(`CREATE TABLE IF NOT EXISTS loan_repayments (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            loanId    INTEGER NOT NULL,
            amount    REAL NOT NULL,
            paidDate  TEXT NOT NULL,
            reference TEXT,
            FOREIGN KEY (loanId) REFERENCES loans(id)
        )`);

        // Loan interest accrual log
        db.run(`CREATE TABLE IF NOT EXISTS loan_interest_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            loanId       INTEGER NOT NULL,
            amount       REAL NOT NULL,
            accrualDate  TEXT NOT NULL,
            type         TEXT DEFAULT 'monthly',
            FOREIGN KEY (loanId) REFERENCES loans(id)
        )`);

        // Penalties
        db.run(`CREATE TABLE IF NOT EXISTS penalties (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId   INTEGER NOT NULL,
            amount     REAL NOT NULL,
            reason     TEXT NOT NULL,
            paidStatus TEXT NOT NULL DEFAULT 'unpaid',
            issuedDate TEXT NOT NULL,
            paidDate   TEXT,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        // Target Savings Pots
        db.run(`CREATE TABLE IF NOT EXISTS target_savings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId      INTEGER NOT NULL,
            name          TEXT NOT NULL,
            targetAmount  REAL NOT NULL,
            currentAmount REAL NOT NULL DEFAULT 0,
            deadline      TEXT,
            status        TEXT DEFAULT 'active',
            createdAt     TEXT NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);
        
        // Target Savings Ledger
        db.run(`CREATE TABLE IF NOT EXISTS target_savings_ledger (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            potId         INTEGER NOT NULL,
            amount        REAL NOT NULL,
            description   TEXT NOT NULL,
            timestamp     TEXT NOT NULL,
            FOREIGN KEY (potId) REFERENCES target_savings(id)
        )`);

        // Meetings
        db.run(`CREATE TABLE IF NOT EXISTS meetings (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            date       TEXT NOT NULL,
            location   TEXT,
            notes      TEXT,
            created_at TEXT NOT NULL
        )`);

        // Meeting attendance (unique per meeting+member)
        db.run(`CREATE TABLE IF NOT EXISTS meeting_attendance (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            meetingId INTEGER NOT NULL,
            memberId  INTEGER NOT NULL,
            attended  INTEGER NOT NULL DEFAULT 0,
            checkInTime TEXT,
            UNIQUE(meetingId, memberId),
            FOREIGN KEY (meetingId) REFERENCES meetings(id),
            FOREIGN KEY (memberId)  REFERENCES members(id)
        )`);
        db.run(`ALTER TABLE meeting_attendance ADD COLUMN checkInTime TEXT`, () => {});

        // Member Documents (KYC)
        db.run(`CREATE TABLE IF NOT EXISTS member_documents (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId     INTEGER NOT NULL,
            documentType TEXT NOT NULL,
            filename     TEXT NOT NULL,
            uploadDate   TEXT NOT NULL,
            uploadedBy   TEXT NOT NULL DEFAULT 'Admin',
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);
        db.run(`ALTER TABLE member_documents ADD COLUMN uploadedBy TEXT NOT NULL DEFAULT 'Admin'`, () => {});

        // Investments
        db.run(`CREATE TABLE IF NOT EXISTS investments (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL,
            type           TEXT NOT NULL,
            amountInvested REAL NOT NULL,
            currentValue   REAL NOT NULL,
            purchaseDate   TEXT NOT NULL,
            status         TEXT NOT NULL DEFAULT 'active'
        )`);

        // Investment valuations history
        db.run(`CREATE TABLE IF NOT EXISTS investment_valuations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            investmentId INTEGER NOT NULL,
            value        REAL NOT NULL,
            valuationDate TEXT NOT NULL,
            FOREIGN KEY (investmentId) REFERENCES investments(id) ON DELETE CASCADE
        )`);

        // Dividends
        db.run(`CREATE TABLE IF NOT EXISTS dividends (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            distributionDate  TEXT NOT NULL,
            totalPoolAmount   REAL NOT NULL,
            calcMethod        TEXT NOT NULL,
            distributedBy     TEXT NOT NULL,
            note              TEXT
        )`);
        db.run(`ALTER TABLE dividends ADD COLUMN distributedBy TEXT`, () => {});
        db.run(`ALTER TABLE dividends ADD COLUMN recordedBy TEXT DEFAULT 'Admin'`, () => {});
        db.run(`ALTER TABLE dividends ADD COLUMN note TEXT`, () => {});
        db.run(`ALTER TABLE dividends ADD COLUMN fundingSource TEXT DEFAULT 'Institutional Reserves'`, () => {});

        // Expenses / Budget Tracking
        db.run(`ALTER TABLE expenses ADD COLUMN fundingSource TEXT DEFAULT 'Institutional Reserves'`, () => {});
        db.run(`CREATE TABLE IF NOT EXISTS expenses (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            category         TEXT NOT NULL,
            amount           REAL NOT NULL,
            description      TEXT NOT NULL,
            recipient        TEXT,
            receiptFilename  TEXT,
            recordedBy       TEXT NOT NULL,
            createdBy        TEXT NOT NULL,
            expenseDate      TEXT NOT NULL,
            status           TEXT NOT NULL DEFAULT 'pending',
            approver1_id     INTEGER,
            approver1_name   TEXT,
            approver2_id     INTEGER,
            approver2_name   TEXT,
            fundingSource    TEXT DEFAULT 'Institutional Reserves',
            timestamp        TEXT NOT NULL
        )`);
        db.run(`ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN approver1_id INTEGER`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN approver2_id INTEGER`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN createdBy TEXT`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN approver1_name TEXT`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN approver2_name TEXT`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN approver3_id INTEGER`, () => {});
        db.run(`ALTER TABLE expenses ADD COLUMN approver3_name TEXT`, () => {});

        // Member Voting / Polls
        db.run(`CREATE TABLE IF NOT EXISTS polls (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            question    TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'active',
            createdBy   TEXT NOT NULL,
            closeDate   TEXT,
            timestamp   TEXT NOT NULL
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS poll_options (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            pollId      INTEGER NOT NULL,
            optionText  TEXT NOT NULL,
            FOREIGN KEY (pollId) REFERENCES polls(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS poll_votes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            pollId      INTEGER NOT NULL,
            optionId    INTEGER NOT NULL,
            memberId    INTEGER NOT NULL,
            timestamp   TEXT NOT NULL,
            UNIQUE(pollId, memberId),
            FOREIGN KEY (pollId) REFERENCES polls(id) ON DELETE CASCADE,
            FOREIGN KEY (optionId) REFERENCES poll_options(id) ON DELETE CASCADE,
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
        )`);

        // ── PHASE 1: Financial tables ─────────────────────────────

        // Loan schedule columns
        db.run(`ALTER TABLE loans ADD COLUMN tenure INTEGER DEFAULT 1`, () => {});
        db.run(`ALTER TABLE loans ADD COLUMN repaymentMethod TEXT DEFAULT 'flat'`, () => {});
        db.run(`ALTER TABLE loans ADD COLUMN originalPrincipal REAL`, () => {});
        db.run(`ALTER TABLE loans ADD COLUMN totalInterest REAL`, () => {});

        // Loan interest accrual log
        db.run(`CREATE TABLE IF NOT EXISTS loan_interest_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            loanId      INTEGER NOT NULL,
            amount      REAL NOT NULL,
            accrualDate TEXT NOT NULL,
            type        TEXT NOT NULL DEFAULT 'monthly',
            FOREIGN KEY (loanId) REFERENCES loans(id)
        )`);

        // Budget tracking
        db.run(`CREATE TABLE IF NOT EXISTS budgets (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            category       TEXT NOT NULL,
            budgetedAmount REAL NOT NULL,
            period         TEXT NOT NULL,
            createdBy      TEXT NOT NULL,
            timestamp      TEXT NOT NULL
        )`);

        // Bank reconciliation
        db.run(`CREATE TABLE IF NOT EXISTS bank_statements (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            entryDate     TEXT NOT NULL,
            description   TEXT NOT NULL,
            amount        REAL NOT NULL,
            type          TEXT NOT NULL DEFAULT 'credit',
            reference     TEXT,
            reconciled    INTEGER NOT NULL DEFAULT 0,
            transactionId INTEGER,
            uploadBatch   TEXT,
            timestamp     TEXT NOT NULL,
            FOREIGN KEY (transactionId) REFERENCES transactions(id)
        )`);

        // ── PHASE 2: Member tables ───────────────────────────────

        // Extended KYC columns
        db.run(`ALTER TABLE members ADD COLUMN idNumber TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN dateOfBirth TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN email TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN emergencyContact TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN emergencyPhone TEXT`, () => {});
        db.run(`ALTER TABLE members ADD COLUMN tierId INTEGER`, () => {});

        // Loan guarantors
        db.run(`CREATE TABLE IF NOT EXISTS loan_guarantors (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            loanId   INTEGER NOT NULL,
            memberId INTEGER NOT NULL,
            amount   REAL NOT NULL DEFAULT 0,
            status   TEXT NOT NULL DEFAULT 'active',
            UNIQUE(loanId, memberId),
            FOREIGN KEY (loanId) REFERENCES loans(id),
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        // Contribution tiers
        db.run(`CREATE TABLE IF NOT EXISTS contribution_tiers (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL UNIQUE,
            monthlyTarget REAL NOT NULL,
            color         TEXT NOT NULL DEFAULT '#6366f1'
        )`, () => {
            // Seed default tiers
            const tiers = [
                ['Silver',   5000,  '#94a3b8'],
                ['Gold',     10000, '#fbbf24'],
                ['Platinum', 20000, '#a78bfa'],
            ];
            for (const [name, target, color] of tiers) {
                db.run(`INSERT OR IGNORE INTO contribution_tiers (name, monthlyTarget, color) VALUES (?, ?, ?)`, [name, target, color]);
            }
        });

        // ── PHASE 3: Org tables ──────────────────────────────────

        // Meeting enhancements
        db.run(`ALTER TABLE meetings ADD COLUMN minutes TEXT`, () => {});
        db.run(`ALTER TABLE meetings ADD COLUMN agenda TEXT`, () => {});
        db.run(`ALTER TABLE meetings ADD COLUMN meetingType TEXT DEFAULT 'regular'`, () => {});
        db.run(`ALTER TABLE meetings ADD COLUMN isMandatory INTEGER DEFAULT 0`, () => {});

        // Meeting resolutions
        db.run(`CREATE TABLE IF NOT EXISTS meeting_resolutions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            meetingId    INTEGER NOT NULL,
            resolution   TEXT NOT NULL,
            proposedBy   TEXT,
            status       TEXT DEFAULT 'passed',
            timestamp    TEXT NOT NULL,
            FOREIGN KEY (meetingId) REFERENCES meetings(id) ON DELETE CASCADE
        )`);

        // AGM resolutions
        db.run(`CREATE TABLE IF NOT EXISTS agm_resolutions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            meetingId    INTEGER NOT NULL,
            resolution   TEXT NOT NULL,
            proposedBy   TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'tabled',
            votesFor     INTEGER NOT NULL DEFAULT 0,
            votesAgainst INTEGER NOT NULL DEFAULT 0,
            votesAbstain INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (meetingId) REFERENCES meetings(id)
        )`);

        // Org document vault
        db.run(`CREATE TABLE IF NOT EXISTS org_documents (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            category    TEXT NOT NULL DEFAULT 'Other',
            filename    TEXT NOT NULL,
            uploadedBy  TEXT NOT NULL,
            uploadDate  TEXT NOT NULL,
            description TEXT
        )`);
        db.run(`ALTER TABLE org_documents ADD COLUMN uploadedBy TEXT NOT NULL DEFAULT 'Admin'`, () => {});

        // ── PHASE 5: Security tables ─────────────────────────────

        // 2FA columns
        db.run(`ALTER TABLE admin_users ADD COLUMN totp_secret TEXT`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN totp_method TEXT DEFAULT 'totp'`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN mfa_token TEXT`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN must_change_password INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN phone TEXT`, () => {});
        db.run(`ALTER TABLE admin_users ADD COLUMN email TEXT`, () => {});

        // Session tracking
        db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            adminId   INTEGER NOT NULL,
            token     TEXT NOT NULL,
            ip        TEXT,
            userAgent TEXT,
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            revoked   INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (adminId) REFERENCES admin_users(id)
        )`);

        // Member Session tracking
        db.run(`CREATE TABLE IF NOT EXISTS member_sessions (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId  INTEGER NOT NULL,
            token     TEXT NOT NULL,
            ip        TEXT,
            userAgent TEXT,
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            revoked   INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        // ── PHASE 6: Comms tables ────────────────────────────────

        // Scheduled SMS campaigns
        db.run(`CREATE TABLE IF NOT EXISTS sms_campaigns (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            message     TEXT NOT NULL,
            audience    TEXT NOT NULL DEFAULT 'all',
            scheduledAt TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'scheduled',
            sentAt      TEXT,
            createdBy   TEXT NOT NULL,
            timestamp   TEXT NOT NULL
        )`);

        // Deletion requests for non-superadmins
        db.run(`CREATE TABLE IF NOT EXISTS delete_requests (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            entityType   TEXT NOT NULL,
            entityId     TEXT NOT NULL,
            requesterId  INTEGER NOT NULL,
            reason       TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'pending',
            approverId   INTEGER,
            processedAt  TEXT,
            timestamp    TEXT NOT NULL,
            FOREIGN KEY (requesterId) REFERENCES admin_users(id),
            FOREIGN KEY (approverId)  REFERENCES admin_users(id)
        )`);

        // Loan Applications (Member initiated)
        db.run(`CREATE TABLE IF NOT EXISTS loan_applications (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId      INTEGER NOT NULL,
            amount        REAL NOT NULL,
            tenure        INTEGER NOT NULL DEFAULT 1,
            reason        TEXT,
            status        TEXT NOT NULL DEFAULT 'pending',
            reviewedBy    INTEGER,
            reviewerNotes TEXT,
            timestamp     TEXT NOT NULL,
            FOREIGN KEY (memberId)   REFERENCES members(id),
            FOREIGN KEY (reviewedBy) REFERENCES admin_users(id)
        )`);

        // Pledges (Commitments for grace periods)
        db.run(`CREATE TABLE IF NOT EXISTS pledges (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId     INTEGER NOT NULL,
            pledgeFee    REAL NOT NULL DEFAULT 100,
            targetDate   TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'active',
            penaltyId    INTEGER,
            timestamp    TEXT NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id),
            FOREIGN KEY (penaltyId) REFERENCES penalties(id)
        )`);
        db.run(`ALTER TABLE pledges ADD COLUMN penaltyId INTEGER`, () => {});
        db.run(`ALTER TABLE pledges ADD COLUMN note TEXT`, () => {});

        // Seed test member if empty
        db.get('SELECT COUNT(*) as c FROM members', [], (err, row) => {
            if (!err && row.c === 0) {
                const now  = new Date();
                const next = new Date(now);
                next.setDate(now.getDate() + 30);
                db.run(`INSERT INTO members (name, phone, joinDate, nextDueDate) VALUES (?, ?, ?, ?)`,
                    ['John Doe', '254711223344', now.toISOString(), next.toISOString()]);
                console.log('Seeded test member.');
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS dividend_distributions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            dividendId   INTEGER NOT NULL,
            memberId     INTEGER NOT NULL,
            amount       REAL NOT NULL,
            timestamp    TEXT NOT NULL,
            FOREIGN KEY (dividendId) REFERENCES dividends(id),
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        console.log('Database verification complete.');

        // ── COMMUNICATION HUB ──────────────────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS comm_threads (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId    INTEGER NOT NULL,
            subject     TEXT    NOT NULL,
            category    TEXT    NOT NULL DEFAULT 'general',
            status      TEXT    NOT NULL DEFAULT 'open',
            created_at  TEXT    NOT NULL,
            updated_at  TEXT    NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        db.run(`ALTER TABLE comm_threads ADD COLUMN category TEXT NOT NULL DEFAULT 'general'`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS comm_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            threadId    INTEGER NOT NULL,
            senderType  TEXT    NOT NULL,
            senderId    INTEGER NOT NULL,
            senderName  TEXT,
            content     TEXT    NOT NULL,
            attachmentUrl TEXT,
            timestamp   TEXT    NOT NULL,
            FOREIGN KEY (threadId) REFERENCES comm_threads(id) ON DELETE CASCADE
        )`);
        db.run(`ALTER TABLE comm_messages ADD COLUMN attachmentUrl TEXT`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS admin_chat (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            adminId     INTEGER NOT NULL,
            senderName  TEXT,
            senderRole  TEXT,
            content     TEXT    NOT NULL,
            attachmentUrl TEXT,
            timestamp   TEXT    NOT NULL,
            FOREIGN KEY (adminId) REFERENCES admin_users(id)
        )`);
        db.run(`ALTER TABLE admin_chat ADD COLUMN attachmentUrl TEXT`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS admin_direct_messages (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            senderId      INTEGER NOT NULL,
            receiverId    INTEGER NOT NULL,
            encryptedData TEXT    NOT NULL,
            iv            TEXT    NOT NULL,
            authTag       TEXT    NOT NULL,
            timestamp     TEXT    NOT NULL,
            FOREIGN KEY(senderId) REFERENCES admin_users(id),
            FOREIGN KEY(receiverId) REFERENCES admin_users(id)
        )`);

        // --- INTELLIGENT NOTIFICATION CENTER ---
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            userId      INTEGER NOT NULL,
            userType    TEXT    NOT NULL, -- 'admin' or 'member'
            title       TEXT    NOT NULL,
            message     TEXT    NOT NULL,
            link        TEXT,
            isRead      INTEGER DEFAULT 0,
            timestamp   TEXT    NOT NULL
        )`);

        // --- GROUP CHANNELS (SLACK-STYLE) ---
        db.run(`CREATE TABLE IF NOT EXISTS comm_channels (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            description TEXT,
            createdBy   INTEGER NOT NULL,
            createdAt   TEXT    NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS comm_channel_members (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            channelId   INTEGER NOT NULL,
            userId      INTEGER NOT NULL,
            userType    TEXT    NOT NULL, -- 'admin' or 'member'
            addedAt     TEXT    NOT NULL,
            UNIQUE(channelId, userId, userType),
            FOREIGN KEY(channelId) REFERENCES comm_channels(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS comm_channel_messages (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            channelId     INTEGER NOT NULL,
            senderId      INTEGER NOT NULL,
            senderType    TEXT    NOT NULL, -- 'admin' or 'member'
            senderName    TEXT    NOT NULL,
            content       TEXT    NOT NULL,
            attachmentUrl TEXT,
            timestamp     TEXT    NOT NULL,
            FOREIGN KEY(channelId) REFERENCES comm_channels(id) ON DELETE CASCADE
        )`);

        // --- PORTFOLIO & INVESTMENTS ---
        db.run(`CREATE TABLE IF NOT EXISTS investments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            type            TEXT    NOT NULL,
            amountInvested  REAL    NOT NULL DEFAULT 0,
            currentValue    REAL    NOT NULL DEFAULT 0,
            purchaseDate    TEXT,
            status          TEXT    NOT NULL DEFAULT 'active',
            notes           TEXT    DEFAULT ''
        )`);
        db.run(`ALTER TABLE investments ADD COLUMN notes TEXT DEFAULT ''`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS investment_history (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            investmentId    INTEGER NOT NULL,
            value           REAL    NOT NULL,
            valuationDate   TEXT    NOT NULL,
            FOREIGN KEY(investmentId) REFERENCES investments(id) ON DELETE CASCADE
        )`);


        // ── PHASE 7: ICT Operational Tables ──────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS settings_audit (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT    NOT NULL,
            old_value   TEXT,
            new_value   TEXT,
            changed_by  TEXT    NOT NULL DEFAULT 'system',
            changed_at  TEXT    NOT NULL
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sa_key ON settings_audit(setting_key)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sa_ts  ON settings_audit(changed_at)`);

        // Member Notifications
        db.run(`CREATE TABLE IF NOT EXISTS member_notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId    INTEGER NOT NULL,
            title       TEXT NOT NULL,
            message     TEXT NOT NULL,
            type        TEXT NOT NULL DEFAULT 'info',
            isRead      INTEGER NOT NULL DEFAULT 0,
            createdAt   TEXT NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        // --- FINTECH AUTOMATION (PHASE 4) ---
        
        // Withdrawals (Member Payout Requests)
        db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
            id            TEXT PRIMARY KEY,
            memberId      INTEGER NOT NULL,
            amount        REAL NOT NULL,
            phone         TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'disbursed', 'failed'
            reviewerNotes TEXT,
            reviewedBy    INTEGER,
            requestedDate TEXT NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id),
            FOREIGN KEY (reviewedBy) REFERENCES admin_users(id)
        )`);

        // M-Pesa B2C Transactions (Tracking automated disbursements)
        db.run(`CREATE TABLE IF NOT EXISTS mpesa_b2c_transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            memberId    INTEGER,
            amount      REAL NOT NULL,
            phone       TEXT NOT NULL,
            conversationId TEXT UNIQUE,
            originatorConversationId TEXT UNIQUE,
            status      TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
            type        TEXT NOT NULL, -- 'loan', 'withdrawal'
            referenceId INTEGER, -- loanId or withdrawalId
            resultDesc  TEXT,
            timestamp   TEXT NOT NULL,
            FOREIGN KEY (memberId) REFERENCES members(id)
        )`);

        console.log('Database verification complete.');
    });
});

module.exports = db;
