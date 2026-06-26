const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const featureFlags = {
    // Member Portal
    'toggle_member_payments': 'true',
    'toggle_member_loans': 'true',
    'toggle_member_pledges': 'true',
    'toggle_member_documents': 'true',
    'toggle_member_support': 'true',
    'toggle_member_notifications': 'true',
    
    // Admin Dashboard
    'toggle_admin_members': 'true',
    'toggle_admin_payments': 'true',
    'toggle_admin_savings': 'true',
    'toggle_admin_loans': 'true',
    'toggle_admin_pledges': 'true',
    'toggle_admin_investments': 'true',
    'toggle_admin_expenses': 'true',
    'toggle_admin_budget': 'true',
    'toggle_admin_reconciliation': 'true',
    'toggle_admin_meetings': 'true',
    'toggle_admin_polls': 'true',
    'toggle_admin_documents': 'true',
    'toggle_admin_campaigns': 'true',
    'toggle_admin_reports': 'true',
    'toggle_admin_communications': 'true',
};

db.serialize(() => {
    console.log('Initializing feature flags...');
    for (const [key, value] of Object.entries(featureFlags)) {
        db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
            if (err) console.error(`Failed to insert ${key}:`, err.message);
        });
    }
    console.log('Feature flags initialized.');
});

db.close();
