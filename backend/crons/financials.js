const cron = require('node-cron');
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { logActivity } = require('../utils/logger');
const { sendSMS } = require('../utils/sms');
const fs = require('fs');
const path = require('path');

async function runAutoPenalties() {
    try {
        const settings = await dbAll('SELECT key, value FROM settings');
        const setMap = settings.reduce((m, s) => ({...m, [s.key]: s.value}), {});
        if (setMap.auto_penalty_enabled !== 'true') return;
        
        const amount = parseFloat(setMap.auto_penalty_amount || setMap.late_fee_amount || 200);
        const overdueDays = parseInt(setMap.auto_penalty_days_overdue || 7);
        const gracePeriod = parseInt(setMap.penalty_grace_period || 0);
        const totalThreshold = overdueDays + gracePeriod;
        
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - totalThreshold);
        const thresholdStr = thresholdDate.toISOString();
        
        const overdues = await dbAll(`SELECT * FROM members WHERE status='active' AND nextDueDate < ?`, [thresholdStr]);
        const currentMonth = new Date().toISOString().substring(0, 7);

        for (const m of overdues) {
            const todayStr = new Date().toISOString().split('T')[0];
            const activePledge = await dbGet(`SELECT id FROM pledges WHERE memberId=? AND status='active' AND targetDate >= ?`, [m.id, todayStr]);
            if (activePledge) continue;

            const exists = await dbGet(`SELECT id FROM penalties WHERE memberId=? AND issuedDate LIKE ? AND reason LIKE 'Automated Late Fee%'`, [m.id, `${currentMonth}%`]);
            if (!exists) {
                const reason = `Automated Late Fee (Overdue by ${totalThreshold} days)`;
                await dbRun(`INSERT INTO penalties (memberId, amount, reason, issuedDate) VALUES (?, ?, ?, ?)`, [m.id, amount, reason, new Date().toISOString()]);
                logActivity('Auto-Penalty', 'Member', m.id, `Charged KES ${amount} late fee`, 'System');
                
                if (setMap.penalty_sms_enabled === 'true' && m.phone) {
                    await sendSMS([m.phone], `[LLUCG] Hi ${m.name}, an automated penalty of KES ${amount} issued due to overdue contribution.`, 'auto_penalty');
                }
            }
        }
    } catch (e) { console.error('[Cron] Penalty Error:', e.message); }
}

async function runLoanInterest() {
    try {
        const settings = await dbAll('SELECT key, value FROM settings');
        const setMap = settings.reduce((m, s) => ({...m, [s.key]: s.value}), {});
        const defaultRate = parseFloat(setMap.default_loan_interest_rate || 0);
        const defaultMethod = setMap.default_loan_interest_type || 'flat';

        const loans = await dbAll("SELECT l.*, m.name as memberName FROM loans l JOIN members m ON l.memberId = m.id WHERE l.status='active'");
        const currentMonth = new Date().toISOString().substring(0, 7);
        let appliedCount = 0;

        for (const l of loans) {
            // Check if interest already applied this month
            const exists = await dbGet("SELECT id FROM loan_interest_log WHERE loanId=? AND accrualDate LIKE ?", [l.id, `${currentMonth}%`]);
            if (exists) continue;

            let interest = 0;
            const rate = (l.interestRate !== undefined && l.interestRate !== null ? l.interestRate : defaultRate) / 100;
            const method = l.repaymentMethod || defaultMethod;

            if (method === 'reducing') {
                const repayments = await dbGet("SELECT SUM(amount) as t FROM loan_repayments WHERE loanId=?", [l.id]);
                const balance = l.amount - (repayments.t || 0);
                if (balance <= 0) continue;
                interest = balance * rate;
            } else {
                // Flat rate
                interest = l.amount * rate;
            }

            if (interest > 0) {
                const rounded = Math.round(interest * 100) / 100;
                await dbRun("INSERT INTO loan_interest_log (loanId, amount, accrualDate, type) VALUES (?, ?, ?, 'monthly')", 
                    [l.id, rounded, new Date().toISOString()]);
                
                // Update totalInterest in loans table for quick summary visibility
                await dbRun("UPDATE loans SET totalInterest = COALESCE(totalInterest, 0) + ? WHERE id = ?", [rounded, l.id]);
                
                logActivity('Interest Applied', 'Loan', l.id, `KES ${rounded} interest added to ${l.memberName}'s loan`, 'System');
                appliedCount++;
            }
        }
        console.log(`[Cron] Loan interest applied to ${appliedCount} active loans.`);
    } catch (e) { console.error('[Cron] Loan interest error:', e.message); }
}

async function runPledgeReminders() {
    const target = new Date();
    target.setDate(target.getDate() + 2);
    const targetDateStr = target.toISOString().split('T')[0];
    try {
        const pledges = await dbAll(`SELECT p.*, m.phone, m.name FROM pledges p JOIN members m ON p.memberId = m.id WHERE p.targetDate = ?`, [targetDateStr]);
        for (const p of pledges) {
            await sendSMS([p.phone], `[LLUCG] Reminder: Your payment pledge expires in 2 days (on ${p.targetDate}).`, 'pledge-reminder');
        }
    } catch (e) { console.error('[Cron] Pledge reminders failed:', e); }
}

async function runMonthlyStatements() {
    try {
        const settings = await dbAll('SELECT key, value FROM settings');
        const setMap = settings.reduce((m, s) => ({...m, [s.key]: s.value}), {});
        const smsEnabled = setMap.sms_enabled !== 'false';

        const members = await dbAll(`SELECT * FROM members WHERE status = 'active'`);
        const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        let sent = 0;

        for (const member of members) {
            try {
                const balance = await dbGet(`
                    SELECT 
                        COALESCE(SUM(CASE WHEN type='SAVINGS' THEN amount ELSE 0 END), 0) as sacco,
                        COALESCE(SUM(CASE WHEN type='PERSONAL' THEN amount ELSE 0 END), 0) as personal,
                        COALESCE(SUM(CASE WHEN type='SHARE_CAPITAL' THEN amount ELSE 0 END), 0) as shares
                    FROM ledger WHERE memberId = ?
                `, [member.id]);

                const activeLoan = await dbGet(`
                    SELECT 
                        l.*, 
                        (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE loanId = l.id) as totalRepaid 
                    FROM loans l 
                    WHERE l.memberId = ? AND l.status = 'active' 
                    LIMIT 1
                `, [member.id]);

                const loanBalance = activeLoan ? (activeLoan.amount + (activeLoan.totalInterest || 0) - (activeLoan.totalRepaid || 0)) : 0;
                const totalWealth = (balance.sacco || 0) + (balance.personal || 0) + (balance.shares || 0);

                const smsBody = [
                    `[LLUCG] ${month} Statement — ${member.name}`,
                    `SACCO Savings: KES ${(balance.sacco || 0).toLocaleString()}`,
                    `Personal: KES ${(balance.personal || 0).toLocaleString()}`,
                    `Shares: KES ${(balance.shares || 0).toLocaleString()}`,
                    activeLoan ? `Loan Balance: KES ${Math.max(0, loanBalance).toLocaleString()}` : null,
                    `Net Wealth: KES ${totalWealth.toLocaleString()}`,
                    `Next Due: ${member.nextDueDate ? new Date(member.nextDueDate).toLocaleDateString('en-GB') : 'N/A'}`
                ].filter(Boolean).join(' | ');

                if (smsEnabled && member.phone) {
                    await sendSMS([member.phone], smsBody, 'monthly_statement');
                    sent++;
                }

                logActivity('Monthly Statement', 'Member', member.id, `Statement dispatched for ${month}`, 'System');
            } catch (memberErr) {
                console.error(`[Cron] Statement failed for member ${member.id}:`, memberErr.message);
            }
        }

        console.log(`[Cron] Monthly statements sent to ${sent}/${members.length} members.`);
    } catch (e) { console.error('[Cron] Monthly statements failed:', e.message); }
}

async function checkScheduledMaintenance() {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'sched_%'");
        const s = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
        if (s.sched_enabled !== 'true' || !s.sched_start || !s.sched_end) return;

        const now = new Date();
        const start = new Date(s.sched_start);
        const end   = new Date(s.sched_end);
        if (isNaN(start) || isNaN(end)) return;

        const isInWindow = now >= start && now <= end;
        const current = await dbGet("SELECT value FROM settings WHERE key = 'maintenance_mode'");
        const currentlyOn = current?.value === 'true';

        if (isInWindow && !currentlyOn) {
            await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('maintenance_mode', 'true')");
            const msg = s.sched_message || 'Scheduled system maintenance in progress. We will be back shortly.';
            await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('maintenance_message', ?)", [msg]);
            logActivity('Scheduled Maintenance Started', 'System', null, `Auto-triggered. Window: ${s.sched_start} → ${s.sched_end}`, 'System');
            console.log('[Cron] ✅ Scheduled maintenance AUTO-ENABLED.');
        } else if (!isInWindow && currentlyOn) {
            await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('maintenance_mode', 'false')");
            logActivity('Scheduled Maintenance Ended', 'System', null, `Window ended — portal restored`, 'System');
            console.log('[Cron] ✅ Scheduled maintenance ended. Portal RESTORED.');
            if (s.sched_recurring === 'once') {
                await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('sched_enabled', 'false')");
                console.log('[Cron] One-time schedule disarmed.');
            }
        }
        // Track last run
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_sched_maintenance', ?)", [new Date().toISOString()]);
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_sched_maintenance', 'success')");
    } catch (e) { console.error('[Cron] Scheduled maintenance check failed:', e.message); }
}

async function runHealthAlerts() {
    try {
        const rows = await dbAll("SELECT key, value FROM settings WHERE key LIKE 'alert_%'");
        const s = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
        if (s.alert_enabled !== 'true') return;

        const phones = (s.alert_phones || '').split(',').map(p => p.trim()).filter(Boolean);
        if (phones.length === 0) return;

        const now = new Date().toISOString();
        const alerts = [];

        // Memory check
        const mem = process.memoryUsage();
        const memPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        const memThreshold = parseInt(s.alert_mem_pct || 85);
        if (memPct >= memThreshold) alerts.push(`MEMORY: Heap at ${memPct}% (threshold: ${memThreshold}%)`);

        // Error spike check (last hour)
        const errCount = await dbGet(
            `SELECT COUNT(*) as c FROM activity_log WHERE (action LIKE '%Failure%' OR action LIKE '%Error%') AND timestamp > datetime('now', '-1 hour')`
        );
        const errThreshold = parseInt(s.alert_error_count || 20);
        if ((errCount?.c || 0) >= errThreshold) alerts.push(`ERRORS: ${errCount.c} in last hour (threshold: ${errThreshold})`);

        // Auth failures (last 24h)
        const authFails = await dbGet(
            `SELECT COUNT(*) as c FROM activity_log WHERE action LIKE '%Unauthorized%' AND timestamp > datetime('now', '-24 hours')`
        );
        const authThreshold = parseInt(s.alert_auth_fail || 10);
        if ((authFails?.c || 0) >= authThreshold) alerts.push(`AUTH: ${authFails.c} unauthorized in 24h (threshold: ${authThreshold})`);

        if (alerts.length > 0) {
            const lastSent = s.alert_last_sent ? new Date(s.alert_last_sent) : null;
            const cooldownOk = !lastSent || (Date.now() - lastSent.getTime()) > 60 * 60 * 1000;
            if (cooldownOk) {
                const message = `[LLUCG ICT ALERT] ${alerts.join(' | ')} — ${new Date().toLocaleTimeString()}`;
                await sendSMS(phones, message, 'ict_health_alert');
                await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('alert_last_sent', ?)", [now]);
                let history = [];
                try { history = JSON.parse(s.alert_history || '[]'); } catch (_) {}
                history.unshift({ ts: now, alerts, phones: phones.length });
                if (history.length > 20) history = history.slice(0, 20);
                await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('alert_history', ?)", [JSON.stringify(history)]);
                logActivity('Health Alert Sent', 'System', null, alerts.join('; '), 'System');
                console.log('[Cron] 🚨 Health alerts sent:', alerts);
            }
        }

        // Track last run
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_health_alerts', ?)", [new Date().toISOString()]);
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_health_alerts', 'success')");
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_msg_health_alerts', ?)", [alerts.length > 0 ? `Alerted: ${alerts.join('; ')}` : 'All systems healthy']);
    } catch (e) { console.error('[Cron] Health alert check failed:', e.message); }
}

async function runScheduledBackup() {
    const pathMod = require('path');
    const fs2     = require('fs');
    try {
        const enabled = await dbGet("SELECT value FROM settings WHERE key = 'backup_schedule_enabled'");
        if (enabled?.value !== 'true') return;

        const keepLast  = parseInt((await dbGet("SELECT value FROM settings WHERE key = 'backup_keep_last'"))?.value || 7);
        const backupDir = pathMod.join(__dirname, '..', 'backups');
        const dbSrc     = pathMod.join(__dirname, '..', 'database.sqlite');
        fs2.mkdirSync(backupDir, { recursive: true });

        const fname = `backup_auto_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        fs2.copyFileSync(dbSrc, pathMod.join(backupDir, fname));
        logActivity('Auto Backup', 'System', null, `Created: ${fname}`, 'System');
        console.log(`[Cron] 💾 Auto backup: ${fname}`);

        // Prune old backups
        const files = fs2.readdirSync(backupDir)
            .filter(f => f.endsWith('.sqlite'))
            .map(f => ({ name: f, mtime: fs2.statSync(pathMod.join(backupDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
        for (let i = keepLast; i < files.length; i++) {
            fs2.unlinkSync(pathMod.join(backupDir, files[i].name));
            console.log(`[Cron] 🗑 Pruned: ${files[i].name}`);
        }

        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_auto_backup', ?)", [new Date().toISOString()]);
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_auto_backup', 'success')");
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_msg_auto_backup', ?)", [`Created: ${fname}`]);
    } catch (e) {
        console.error('[Cron] Backup failed:', e.message);
        dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_auto_backup', 'error')").catch(() => {});
        dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_msg_auto_backup', ?)", [e.message]).catch(() => {});
    }
}

async function runDatabaseBackup() {
    const DB_PATH = path.join(__dirname, '../database.sqlite');
    const BACKUP_DIR = path.join(__dirname, '../backups');

    console.log('[Cron] Rotating system backups...');
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `backup_${timestamp}.sqlite`;
        const destPath = path.join(BACKUP_DIR, backupFile);

        fs.copyFileSync(DB_PATH, destPath);
        console.log(`[Cron] Backup successful: ${backupFile}`);
        logActivity('System Backup', 'Security', 0, `Automated nightly backup created: ${backupFile}`, 'System Cron');

        // Clean up backups older than 30 days
        const files = fs.readdirSync(BACKUP_DIR);
        const now = Date.now();
        const maxAge = 30 * 24 * 60 * 60 * 1000;

        let deletedCount = 0;
        files.forEach(file => {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            console.log(`[Cron] Purged ${deletedCount} legacy backup files.`);
        }
    } catch (err) {
        console.error('[Cron] Nightly backup failed:', err);
        logActivity('System Backup Failure', 'Security', 0, `Automated backup failed: ${err.message}`, 'System Cron');
    }
}

async function runCampaignProcessor() {
    try {
        const now = new Date().toISOString();
        const pending = await dbAll(`SELECT * FROM sms_campaigns WHERE status = 'scheduled' AND scheduledAt <= ?`, [now]);
        
        if (pending.length === 0) return;

        for (const c of pending) {
            console.log(`[Campaign] Processing: ${c.title}`);
            let recipients = [];
            
            if (c.audience === 'all') {
                const members = await dbAll(`SELECT phone FROM members WHERE status = 'active' AND phone IS NOT NULL`);
                recipients = members.map(m => m.phone);
            } else if (c.audience === 'overdue') {
                const members = await dbAll(`SELECT phone FROM members WHERE status = 'active' AND nextDueDate < ? AND phone IS NOT NULL`, [now]);
                recipients = members.map(m => m.phone);
            }

            if (recipients.length > 0) {
                await sendSMS(recipients, c.message, 'campaign');
                console.log(`[Campaign] Sent to ${recipients.length} recipients`);
            }

            await dbRun(`UPDATE sms_campaigns SET status = 'sent', sentAt = ? WHERE id = ?`, [now, c.id]);
            logActivity('SMS Campaign Sent', 'System', c.id, `Title: ${c.title} | Recipients: ${recipients.length}`, 'System');
        }
    } catch (e) {
        console.error('[Cron] Campaign Processor Error:', e.message);
    }
}

function initCrons() {
    // Every minute: Scheduled maintenance & SMS Campaigns
    cron.schedule('* * * * *', () => {
        checkScheduledMaintenance();
        runCampaignProcessor();
    });

    // Every 5 minutes: Health alert threshold checks
    cron.schedule('*/5 * * * *', runHealthAlerts);

    // Every hour: Check if backup is due (based on configured time)
    cron.schedule('0 * * * *', async () => {
        try {
            const timeRow = await dbGet("SELECT value FROM settings WHERE key = 'backup_schedule_time'");
            const configuredHour = parseInt((timeRow?.value || '03:00').split(':')[0]);
            if (new Date().getHours() === configuredHour) await runScheduledBackup();
        } catch (e) { console.error('[Cron] Backup check error:', e.message); }
    });

    // Daily 8AM: Overdue notices
    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Running daily overdue checks...');
        const today = new Date().toISOString();
        const members = await dbAll(`SELECT * FROM members WHERE status='active' AND nextDueDate < ?`, [today]);
        for (const m of members) {
            await sendSMS([m.phone], `[LLUCG] Hi ${m.name}, your monthly contribution is overdue.`, 'overdue');
        }
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_overdue_notice', ?)", [new Date().toISOString()]).catch(() => {});
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_overdue_notice', 'success')").catch(() => {});
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_msg_overdue_notice', ?)", [`Sent to ${members.length} member(s)`]).catch(() => {});
    });

    // Daily 1AM: Auto-Penalties & Loan Interest
    cron.schedule('0 1 * * *', async () => {
        await runAutoPenalties();
        await runLoanInterest();
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_auto_penalty', ?)", [new Date().toISOString()]).catch(() => {});
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_auto_penalty', 'success')").catch(() => {});
    });

    // Daily 10AM: Pledge Reminders
    cron.schedule('0 10 * * *', async () => {
        await runPledgeReminders();
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_pledge_reminder', ?)", [new Date().toISOString()]).catch(() => {});
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_pledge_reminder', 'success')").catch(() => {});
    });

    // 1st of month 8AM: Monthly Statements
    cron.schedule('0 8 1 * *', async () => {
        console.log('[Cron] Generating monthly statements...');
        await runMonthlyStatements();
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_monthly_statement', ?)", [new Date().toISOString()]).catch(() => {});
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_monthly_statement', 'success')").catch(() => {});
    });

    // 2AM: Nightly Database Backup & Cleanup
    cron.schedule('0 2 * * *', async () => {
        await runDatabaseBackup();
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_run_db_backup', ?)", [new Date().toISOString()]).catch(() => {});
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('cron_last_status_db_backup', 'success')").catch(() => {});
    });

    console.log('[Crons] All ICT + financial tasks initialized (maintenance, health alerts, backups, financials).');
}

module.exports = { 
    initCrons, 
    runAutoPenalties, 
    runLoanInterest, 
    runPledgeReminders, 
    runMonthlyStatements,
    checkScheduledMaintenance,
    runHealthAlerts,
    runScheduledBackup,
    runCampaignProcessor
};
