const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

async function backfill() {
    console.log("Starting transaction ledger backfill...");
    
    // 1. Clear existing transactions to prevent duplicates during this sync
    // (Or we could be smarter, but a full sync is safer for a one-time fix)
    // Actually, let's just add missing ones.
    
    // 1. Inflow: Payments
    const payments = await new Promise((res) => db.all("SELECT p.*, m.name FROM payments p JOIN members m ON p.memberId=m.id WHERE p.status='completed'", (err, rows) => res(rows)));
    for (const p of payments) {
        const ref = p.reference || `PAY-${p.id}`;
        const exists = await new Promise((res) => db.get("SELECT id FROM transactions WHERE reference=?", [ref], (err, row) => res(row)));
        if (!exists) {
            console.log(`Backfilling Payment: ${ref}`);
            await new Promise((res) => db.run(
                "INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('credit', ?, ?, 'System', ?, ?)",
                [p.amount, `Backfill: Payment from ${p.name}`, p.paymentDate, ref], res
            ));
        }
    }

    // 2. Outflow: Expenses (Approved only)
    const expenses = await new Promise((res) => db.all("SELECT * FROM expenses WHERE status='approved'", (err, rows) => res(rows)));
    for (const e of expenses) {
        const ref = `EXP-${e.id}`;
        const exists = await new Promise((res) => db.get("SELECT id FROM transactions WHERE reference=?", [ref], (err, row) => res(row)));
        if (!exists) {
            console.log(`Backfilling Expense: ${ref}`);
            await new Promise((res) => db.run(
                "INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('debit', ?, ?, 'System', ?, ?)",
                [e.amount, `Backfill: Expense ${e.category}`, e.expenseDate, ref], res
            ));
        }
    }

    // 3. Outflow: Loan Disbursements
    const loans = await new Promise((res) => db.all("SELECT l.*, m.name FROM loans l JOIN members m ON l.memberId=m.id WHERE l.status IN ('active', 'repaid', 'defaulted')", (err, rows) => res(rows)));
    for (const l of loans) {
        const ref = `LOAN-${l.id}`;
        const exists = await new Promise((res) => db.get("SELECT id FROM transactions WHERE reference=?", [ref], (err, row) => res(row)));
        if (!exists) {
            console.log(`Backfilling Loan: ${ref}`);
            await new Promise((res) => db.run(
                "INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('debit', ?, ?, 'System', ?, ?)",
                [l.originalPrincipal || l.amount, `Backfill: Loan to ${l.name}`, l.disbursedDate, ref], res
            ));
        }
    }

    // 4. Inflow: Loan Repayments
    const repayments = await new Promise((res) => db.all("SELECT lr.*, m.name FROM loan_repayments lr JOIN loans l ON lr.loanId=l.id JOIN members m ON l.memberId=m.id", (err, rows) => res(rows)));
    for (const r of repayments) {
        const ref = r.reference || `LRP-${r.id}`;
        const exists = await new Promise((res) => db.get("SELECT id FROM transactions WHERE reference=?", [ref], (err, row) => res(row)));
        if (!exists) {
            console.log(`Backfilling Repayment: ${ref}`);
            await new Promise((res) => db.run(
                "INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('credit', ?, ?, 'System', ?, ?)",
                [r.amount, `Backfill: Loan Repayment from ${r.name}`, r.paidDate, ref], res
            ));
        }
    }

    console.log("Backfill complete.");
    db.close();
}

backfill();
