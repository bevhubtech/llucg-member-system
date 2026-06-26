const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const db = new sqlite3.Database('c:/Users/odero/.gemini/antigravity/scratch/member_system/backend/database.sqlite');

const vaultDir = 'c:/Users/odero/.gemini/antigravity/scratch/member_system/backend/uploads/vault';

const sync = async () => {
    if (!fs.existsSync(vaultDir)) {
        console.log("Vault directory not found.");
        return;
    }

    const files = fs.readdirSync(vaultDir);
    console.log(`Found ${files.length} files in vault directory.`);

    for (const file of files) {
        // Check if already in DB
        const existing = await new Promise((resolve) => {
            db.get("SELECT id FROM org_documents WHERE filename = ?", [file], (err, row) => resolve(row));
        });

        if (!existing) {
            console.log(`Syncing ${file} to database...`);
            const title = file.split('_').slice(0, 2).join(' ').replace('.pdf', '');
            const uploadDate = new Date().toISOString();
            await new Promise((resolve) => {
                db.run(
                    "INSERT INTO org_documents (title, category, filename, uploadedBy, uploadDate, description) VALUES (?, ?, ?, ?, ?, ?)",
                    [title || file, 'General', file, 'System Admin', uploadDate, 'Automatically restored from filesystem.'],
                    (err) => {
                        if (err) console.error(`Failed to sync ${file}:`, err.message);
                        resolve();
                    }
                );
            });
        }
    }
    console.log("Sync complete.");
    db.close();
};

sync();
