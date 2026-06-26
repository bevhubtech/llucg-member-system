const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'database.js');
let content = fs.readFileSync(dbFile, 'utf8');

const auditTable = `\n\n        // ── PHASE 7: ICT Operational Tables ──────────────────────
        db.run(\`CREATE TABLE IF NOT EXISTS settings_audit (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT    NOT NULL,
            old_value   TEXT,
            new_value   TEXT,
            changed_by  TEXT    NOT NULL DEFAULT 'system',
            changed_at  TEXT    NOT NULL
        )\`);
        db.run(\`CREATE INDEX IF NOT EXISTS idx_sa_key ON settings_audit(setting_key)\`);
        db.run(\`CREATE INDEX IF NOT EXISTS idx_sa_ts  ON settings_audit(changed_at)\`);`;

// Find the last closing of db.serialize and inject the table before it
const TARGET = '        )`);\n    });\n});';
const REPLACEMENT = '        )`);\n' + auditTable + '\n    });\n});';

if (content.includes(TARGET)) {
    content = content.replace(TARGET, REPLACEMENT);
    fs.writeFileSync(dbFile, content);
    console.log('✅ settings_audit table added to database.js');
} else {
    // Try alternative ending detection
    const altTarget = '        )`);\n    });\n});\n\nmodule.exports = db;';
    const altReplacement = '        )`);\n' + auditTable + '\n    });\n});\n\nmodule.exports = db;';
    if (content.includes(altTarget)) {
        content = content.replace(altTarget, altReplacement);
        fs.writeFileSync(dbFile, content);
        console.log('✅ settings_audit table added (alt match)');
    } else {
        // Manual injection: find last db.run before the closing
        const insertPoint = content.lastIndexOf("        )`);\n    });");
        if (insertPoint !== -1) {
            content = content.slice(0, insertPoint + 9) + auditTable + '\n' + content.slice(insertPoint + 9);
            fs.writeFileSync(dbFile, content);
            console.log('✅ settings_audit injected at last position');
        } else {
            console.error('❌ Could not find injection point');
            process.exit(1);
        }
    }
}
