const axios = require('axios');
require('dotenv').config();

const {
    MPESA_ENVIRONMENT,
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_PASSKEY,
    MPESA_SHORTCODE,
    MPESA_CALLBACK_URL
} = process.env;

const isSandbox = MPESA_ENVIRONMENT === 'sandbox' || !MPESA_ENVIRONMENT;
const BASE_URL = isSandbox 
    ? 'https://sandbox.safaricom.co.ke' 
    : 'https://api.safaricom.co.ke';

/**
 * Generate M-Pesa OAuth Access Token
 */
async function getMpesaToken() {
    if (MPESA_CONSUMER_KEY === 'sandbox_consumer_key_placeholder') {
        return 'mock_token_123';
    }
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
    
    try {
        const response = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { Authorization: `Basic ${auth}` }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('[M-Pesa] Token generation failed:', error.response?.data || error.message);
        throw new Error('Failed to generate M-Pesa access token');
    }
}

/**
 * Trigger STK Push Prompt on User's Phone
 */
async function triggerSTKPush(phone, amount, reference, description) {
    if (MPESA_CONSUMER_KEY === 'sandbox_consumer_key_placeholder') {
        // Mock successful STK Push response
        return {
            CheckoutRequestID: `ws_CO_${Date.now()}`,
            MerchantRequestID: `12345-67890-1`,
            ResponseCode: "0",
            ResponseDescription: "Success. Request accepted for processing",
            CustomerMessage: "Success. Request accepted for processing"
        };
    }

    try {
        const token = await getMpesaToken();
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14); // YYYYMMDDHHmmss
        const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

        const payload = {
            BusinessShortCode: MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.ceil(amount), // Safaricom takes integers
            PartyA: phone, // The sender's phone number
            PartyB: MPESA_SHORTCODE, // The recipient paybill
            PhoneNumber: phone,
            CallBackURL: MPESA_CALLBACK_URL,
            AccountReference: reference.substring(0, 12),
            TransactionDesc: description.substring(0, 13)
        };

        const response = await axios.post(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data; // Expected { CheckoutRequestID, MerchantRequestID, ResponseCode, ResponseDescription, CustomerMessage }
    } catch (error) {
        console.error('[M-Pesa] STK Push failed:', error.response?.data || error.message);
        throw new Error(error.response?.data?.errorMessage || 'M-Pesa STK Push failed');
    }
}

/**
 * Trigger B2C Disbursement (Business to Customer)
 * Used for Loan payouts or Withdrawals
 */
async function triggerB2CRequest(phone, amount, commandId = 'BusinessPayment', remarks = 'SACCO Disbursement', occasion = '') {
    if (MPESA_CONSUMER_KEY === 'sandbox_consumer_key_placeholder') {
        // Mock successful B2C response
        return {
            ConversationID: `CNV_${Date.now()}`,
            OriginatorConversationID: `ORG_${Date.now()}`,
            ResponseCode: "0",
            ResponseDescription: "Accept the service request successfully."
        };
    }

    try {
        const token = await getMpesaToken();
        const payload = {
            InitiatorName: process.env.MPESA_B2C_INITIATOR || 'testapi',
            SecurityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
            CommandID: commandId,
            Amount: Math.floor(amount),
            PartyA: MPESA_SHORTCODE,
            PartyB: phone,
            Remarks: remarks,
            QueueTimeOutURL: process.env.MPESA_B2C_TIMEOUT_URL || MPESA_CALLBACK_URL,
            ResultURL: process.env.MPESA_B2C_RESULT_URL || MPESA_CALLBACK_URL,
            Occasion: occasion
        };

        const response = await axios.post(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('[M-Pesa B2C] Request failed:', error.response?.data || error.message);
        throw new Error(error.response?.data?.errorMessage || 'M-Pesa B2C disbursement failed');
    }
}

module.exports = {
    getMpesaToken,
    triggerSTKPush,
    triggerB2CRequest
};
