const db = require('../database');

/**
 * Sends an email using the Resend API.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of the email
 */
async function sendEmail(to, subject, html) {
    try {
        // Fetch API key from settings
        const row = await new Promise((res) => db.get("SELECT value FROM settings WHERE key = 'cred_resend_apikey'", (e, r) => res(r)));
        const apiKey = row?.value || process.env.RESEND_API_KEY;

        if (!apiKey) {
            console.error('[EMAIL] Resend API Key is missing. Email skipped.');
            return { status: 'failed', error: 'API Key missing' };
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                from: 'LLUCG Security <onboarding@resend.dev>', // Resend default for unverified domains
                to: [to],
                subject: subject,
                html: html
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Resend API error');
        }

        console.log(`[EMAIL] Dispatched to ${to}: ${data.id}`);
        return { status: 'sent', id: data.id };
    } catch (err) {
        console.error('[EMAIL] Failed to send email:', err.message);
        return { status: 'failed', error: err.message };
    }
}

module.exports = { sendEmail };
