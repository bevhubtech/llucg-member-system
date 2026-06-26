const axios = require('axios');
const API_URL = 'http://localhost:5000/api';

async function verifyInvestments() {
    console.log('🧪 Starting Investment Growth Verification...');
    
    try {
        // 1. Login
        const login = await axios.post(`${API_URL}/auth/login`, { username: 'admin', password: 'password123' });
        const token = login.data.token;
        const auth  = { headers: { Authorization: `Bearer ${token}` } };
        console.log('✅ Logged in as admin.');

        // 2. Create an Investment (e.g. Land)
        const inv = await axios.post(`${API_URL}/investments`, {
            name: 'Kajiado Plot A1',
            type: 'Land',
            amountInvested: 1000000,
            currentValue: 1000000,
            purchaseDate: '2025-01-01'
        }, auth);
        const invId = inv.data.id;
        console.log(`✅ Created Investment: ${inv.data.name} (ID: ${invId})`);

        // 3. Add a new valuation (Appreciation)
        console.log('📈 Adding valuation: Appreciation to 1.2M...');
        await axios.post(`${API_URL}/investments/${invId}/valuation`, {
            value: 1200000,
            valuationDate: '2025-06-01'
        }, auth);

        // 4. Add another valuation (Further Appreciation)
        console.log('📈 Adding valuation: Appreciation to 1.5M...');
        await axios.post(`${API_URL}/investments/${invId}/valuation`, {
            value: 1500000,
            valuationDate: '2026-03-31'
        }, auth);

        // 5. Fetch History
        const history = await axios.get(`${API_URL}/investments/${invId}/history`, auth);
        console.log('📊 Valuation History Points:', history.data.history.length);
        history.data.history.forEach(h => {
            console.log(`   - ${h.valuationDate}: KES ${h.value.toLocaleString()}`);
        });

        // 6. Verify Current Value in main record
        const all = await axios.get(`${API_URL}/investments`, auth);
        const record = all.data.investments.find(i => i.id === invId);
        console.log(`\n💎 Final Status for ${record.name}:`);
        console.log(`   - Capital: KES ${record.amountInvested.toLocaleString()}`);
        console.log(`   - Market:  KES ${record.currentValue.toLocaleString()}`);
        const roi = (((record.currentValue - record.amountInvested) / record.amountInvested) * 100).toFixed(1);
        console.log(`   - ROI:     ${roi}%`);

        if (record.currentValue === 1500000 && history.data.history.length === 3) {
            console.log('\n✨ VERIFICATION SUCCESSFUL: Growth tracking is fully operational.');
        } else {
            console.error('\n❌ Verification Failed: Data mismatch.');
        }

    } catch (err) {
        console.error('❌ Verification Error:', err.response?.data || err.message);
    }
}

verifyInvestments();
