const db = require('../database');
const fs = require('fs');
const path = require('path');

const dbAll = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbGet = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbRun = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function(e) { e ? rej(e) : res(this); }));

const getSystemSettings = async () => {
    const rows = await dbAll('SELECT key, value FROM settings');
    return rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
};

const isMaintenanceMode = async () => {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', ['maintenance_mode']);
    return row?.value === 'true';
};

const getMaintenanceStatus = async () => {
    const rows = await dbAll('SELECT key, value FROM settings WHERE key IN (?, ?, ?)', ['maintenance_mode', 'maintenance_resolution', 'maintenance_message']);
    const settings = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    return {
        enabled: settings.maintenance_mode === 'true',
        resolution: settings.maintenance_resolution || 'shortly',
        message: settings.maintenance_message || 'The Member Portal is currently undergoing essential system maintenance to enhance security and performance.'
    };
};

const normalizePhone = (p) => {
    if (!p) return '';
    let s = p.toString().replace(/\D/g, '');
    if (s.startsWith('0')) s = '254' + s.substring(1);
    if (s.length === 9) s = '254' + s;
    if (s.startsWith('7') && s.length === 9) s = '254' + s;
    return s;
};

const sanitizeFilename = (filename) => {
    return filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
};

const getMemberPhoto = async (memberId) => {
    const doc = await dbGet('SELECT filename FROM member_documents WHERE memberId = ? AND documentType = "Passport Photo" ORDER BY uploadDate DESC LIMIT 1', [memberId]);
    if (!doc) return null;
    const photoPath = path.join(__dirname, '..', 'uploads', doc.filename);
    return fs.existsSync(photoPath) ? photoPath : null;
};
const getLocalIP = () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
};

const upsertSetting = async (key, value, changedBy = 'system') => {
    const existing = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
    const oldValue = existing?.value ?? null;
    const valStr = String(value);

    if (existing) {
        await dbRun('UPDATE settings SET value = ? WHERE key = ?', [valStr, key]);
    } else {
        await dbRun('INSERT INTO settings (key, value) VALUES (?, ?)', [key, valStr]);
    }

    try {
        await dbRun(
            'INSERT INTO settings_audit (setting_key, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?)',
            [key, oldValue, valStr, changedBy, new Date().toISOString()]
        );
    } catch (_) {}
};

const fetchSetting = async (key, fallback = null) => {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? fallback;
};

const getMemberSavings = async (memberId) => {
    // Ledger is the authoritative source — SAVINGS and WELFARE are always correctly separated here
    const savingsFromLedger = await dbGet(
        "SELECT COALESCE(SUM(amount), 0) as t FROM ledger WHERE memberId = ? AND type IN ('SAVINGS', 'SHARE_CAPITAL')",
        [memberId]
    );
    return savingsFromLedger?.t || 0;
};

const getSystemLiquidity = async (fundName = null) => {
    // Definitive Liquidity = Total Cash In (credits) - Total Cash Out (debits)
    // Filtered by fund if fundName is provided
    let creditSql = "SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type='credit'";
    let debitSql  = "SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type='debit'";
    let params = [];

    if (fundName) {
        creditSql += " AND fund = ?";
        debitSql  += " AND fund = ?";
        params = [fundName, fundName];
    }

    const [credits, debits] = await Promise.all([
        dbGet(creditSql, fundName ? [fundName] : []),
        dbGet(debitSql, fundName ? [fundName] : [])
    ]);

    const cashIn = credits?.t || 0;
    const cashOut = debits?.t || 0;
    return Math.max(0, cashIn - cashOut);
};

module.exports = {
    dbAll, dbGet, dbRun,
    dbAll,
    dbGet,
    dbRun,
    getSystemSettings,
    isMaintenanceMode,
    getMaintenanceStatus,
    normalizePhone,
    sanitizeFilename,
    getMemberPhoto,
    getLocalIP,
    upsertSetting,
    fetchSetting,
    getMemberSavings,
    getSystemLiquidity
};
