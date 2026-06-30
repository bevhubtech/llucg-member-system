const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.connect((err) => {
    if (err) { console.error('Error opening Postgres database', err.message); return; }
    console.log('Connected to Postgres database.');
});

const convertQuery = (sql, params = []) => {
    let i = 1;
    let text = sql.replace(/\?/g, () => `$${i++}`);
    text = text.replace(/date\('now'\)/gi, 'CURRENT_DATE');
    text = text.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
    text = text.replace(/date\('now',\s*'-(.*?)'\)/gi, (match, interval) => `CURRENT_DATE - INTERVAL '${interval}'`);
    text = text.replace(/datetime\('now',\s*'-(.*?)'\)/gi, (match, interval) => `CURRENT_TIMESTAMP - INTERVAL '${interval}'`);
    text = text.replace(/datetime\('now',\s*'\+(.*?)'\)/gi, (match, interval) => `CURRENT_TIMESTAMP + INTERVAL '${interval}'`);
    
    text = text.replace(/strftime\('%Y-%m',\s*([^)]+)\)/gi, "TO_CHAR(CAST($1 AS TIMESTAMP), 'YYYY-MM')");
    text = text.replace(/strftime\('%Y',\s*([^)]+)\)/gi, "TO_CHAR(CAST($1 AS TIMESTAMP), 'YYYY')");
    text = text.replace(/strftime\('%m',\s*([^)]+)\)/gi, "TO_CHAR(CAST($1 AS TIMESTAMP), 'MM')");
    text = text.replace(/strftime\('%Y-W%W',\s*([^)]+)\)/gi, "TO_CHAR(CAST($1 AS TIMESTAMP), 'IYYY-\"W\"IW')");
    
    text = text.replace(/([a-zA-Z_]+)\s*>=\s*CURRENT_DATE/gi, 'CAST($1 AS TIMESTAMP) >= CURRENT_DATE');
    text = text.replace(/([a-zA-Z_]+)\s*>=\s*CURRENT_TIMESTAMP/gi, 'CAST($1 AS TIMESTAMP) >= CURRENT_TIMESTAMP');
    text = text.replace(/([a-zA-Z_]+)\s*<\s*CURRENT_DATE/gi, 'CAST($1 AS TIMESTAMP) < CURRENT_DATE');
    text = text.replace(/([a-zA-Z_]+)\s*<\s*CURRENT_TIMESTAMP/gi, 'CAST($1 AS TIMESTAMP) < CURRENT_TIMESTAMP');

    return { text, values: params };
};

const keyMap = {
    memberid: 'memberId', paymentdate: 'paymentDate', joindate: 'joinDate', nextduedate: 'nextDueDate',
    wallettype: 'walletType', expensecategory: 'expenseCategory', expensedate: 'expenseDate', 
    disburseddate: 'disbursedDate', duedate: 'dueDate', approvedby: 'approvedBy',
    membershipnumber: 'membershipNumber', pledgeid: 'pledgeId', pledgefee: 'pledgeFee', paidstatus: 'paidStatus',
    adminid: 'adminId', useragent: 'userAgent', createdat: 'createdAt', expiresat: 'expiresAt',
    totp_enabled: 'totp_enabled', totp_secret: 'totp_secret', totp_method: 'totp_method',
    last_login: 'last_login', last_ip: 'last_ip', locked_until: 'locked_until', failed_attempts: 'failed_attempts',
    must_change_password: 'must_change_password'
};

const restoreCamelCase = (rows) => {
    if (!rows) return rows;
    return rows.map(row => {
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
            newRow[keyMap[key] || key] = value;
        }
        return newRow;
    });
}

const executeQuery = (text, values, isInsert, fakeCallback) => {
    pool.query(text, values, function(err, res) {
        if (err) {
            if (err.code === '42P07' || err.code === '42701') {
                if (fakeCallback) fakeCallback(null, { lastID: null, changes: 0 });
                return;
            }
            console.error("SQL Error: ", err.message, " | Query: ", text);
            if (fakeCallback) fakeCallback(err, null);
            return;
        }
        let fakeThis = null;
        if (isInsert) {
             fakeThis = {
                 lastID: res.rows && res.rows.length > 0 ? res.rows[0].id : null,
                 changes: res.rowCount
             };
        }
        if (fakeCallback) fakeCallback(null, fakeThis || restoreCamelCase(res.rows));
    });
};

const db = {
    serialize: (callback) => {
        // No-op for Postgres, pooling handles concurrency natively
        callback();
    },
    run: (sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        
        let queryText = sql;
        const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
        if (isInsert && !sql.toUpperCase().includes('RETURNING') && 
            !sql.toUpperCase().includes('SYSTEM_FEATURES') && 
            !sql.toUpperCase().includes('PORTAL_SETTINGS') && 
            !sql.toUpperCase().includes('WITHDRAWALS')) {
            queryText = queryText.replace(/;?\s*$/, ' RETURNING id');
        }

        const { text, values } = convertQuery(queryText, params);
        executeQuery(text, values, isInsert, (err, fakeThis) => {
            if (err) return callback && callback(err);
            if (callback) callback.call(fakeThis || {}, null);
        });
    },
    get: (sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        const { text, values } = convertQuery(sql, params);
        executeQuery(text, values, false, (err, res) => {
            if (err) return callback && callback(err);
            if (callback) callback(null, res && res.length > 0 ? res[0] : null);
        });
    },
    all: (sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        const { text, values } = convertQuery(sql, params);
        executeQuery(text, values, false, (err, res) => {
            if (err) return callback && callback(err);
            if (callback) callback(null, res);
        });
    },
    close: (callback) => {
        pool.end(() => {
            if (callback) callback(null);
        });
    }
};

module.exports = db;
