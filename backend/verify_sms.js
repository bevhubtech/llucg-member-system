require('dotenv').config();
const db = require('./database');
const AfricasTalking = require('africastalking');
const at  = AfricasTalking({ username: process.env.AT_USERNAME || 'sandbox', apiKey: process.env.AT_API_KEY || '' });
const sms = at.SMS;

async function sendSMS(phones, message, type = 'manual') {
    let status = 'sent';
    const normalized = phones.map(p => {
        let clean = String(p).replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '254' + clean.slice(1);
        if (clean.length === 9)    clean = '254' + clean;
        return '+' + clean;
    });
    
    console.log(`Sending to: ${normalized.join(', ')}`);
    try {
        const from = process.env.AT_SENDER_ID || '';
        const options = { to: normalized, message };
        if (from) options.from = from;
        
        const response = await sms.send(options);
        console.log('AT Response:', JSON.stringify(response, null, 2));
        
        if (response?.SMSMessageData?.Message && !['Sent','Success'].includes(response.SMSMessageData.Message)) {
            status = 'failed';
        } else if (response?.SMSMessageData?.Recipients?.every(r => !['Success','Sent'].includes(r.status))) {
            status = 'failed';
        }
    } catch (err) {
        console.error('Error:', err.message);
        status = 'failed';
    }
    console.log('Final Status:', status);
}

sendSMS(['0719207740'], 'Test normalization fix');
