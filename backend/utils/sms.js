const db = require('../database');
const AfricasTalking = require('africastalking');

let atClient = null;
let lastUsedApiKey = null;

async function getATClient() {
    const rows = await new Promise((res) => db.all("SELECT key, value FROM settings WHERE key IN ('cred_at_username', 'cred_at_apikey')", [], (e, r) => res(r || [])));
    const creds = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    
    const username = creds.cred_at_username || process.env.AT_USERNAME || 'sandbox';
    const apiKey   = creds.cred_at_apikey   || process.env.AT_API_KEY || 'dummy_key';

    if (!atClient || lastUsedApiKey !== apiKey) {
        atClient = AfricasTalking({ username, apiKey });
        lastUsedApiKey = apiKey;
        console.log(`[SMS] Re-initialized client for ${username}`);
    }
    return atClient.SMS;
}

async function sendSMS(phones, message, type = 'manual') {
    let status = 'sent';
    let details = [];
    const normalized = phones
        .filter(p => p && !['12345678', '11223344', '0711223344', '0712345678'].some(test => String(p).includes(test)))
        .map(p => {
            let clean = String(p).replace(/\D/g, '');
            if (clean.startsWith('0')) clean = '254' + clean.slice(1);
            if (clean.length === 9)    clean = '254' + clean;
            return '+' + clean;
        });
    
    if (normalized.length === 0) return { status: 'failed', results: [{ status: 'skipped', number: 'no valid number' }] };

    try {
        const sms = await getATClient();
        const senderRow = await new Promise((res) => db.get("SELECT value FROM settings WHERE key = 'cred_at_sender_id'", (e, r) => res(r)));
        const from = senderRow?.value || process.env.AT_SENDER_ID || '';
        
        const options = { to: normalized, message };
        if (from) options.from = from;
        
        const response = await sms.send(options);
        console.log('[SMS] Detailed AT Response:', JSON.stringify(response, null, 2));
        
        details = (response?.SMSMessageData?.Recipients || []).map(r => ({
            number: r.number,
            status: ['Success', 'Sent'].includes(r.status) ? 'sent' : r.status,
            cost: r.cost
        }));

        if (details.every(d => d.status !== 'sent')) status = 'failed';
        else if (details.some(d => d.status !== 'sent')) status = 'partial';
    } catch (err) {
        console.error('[SMS] Network/Auth Error:', err.message || err);
        status = 'failed';
        details = normalized.map(n => ({ number: n, status: 'error' }));
    }
    
    db.run(
        `INSERT INTO sms_log (type, recipients, message, status, details, timestamp) VALUES (?,?,?,?,?,?)`,
        [type, JSON.stringify(normalized), message, status, JSON.stringify(details), new Date().toISOString()]
    );
    return { status, details };
}

module.exports = { sendSMS };
