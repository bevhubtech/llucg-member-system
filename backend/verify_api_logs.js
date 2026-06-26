const axios = require('axios');

async function verifyAPI() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post('http://127.0.0.1:5001/api/auth/login', {
            username: 'dev_admin',
            password: 'password123'
        });
        
        const token = loginRes.data.token;
        console.log('Login successful. Token:', token.substring(0, 20) + '...');

        console.log('\nFetching SMS logs...');
        const logsRes = await axios.get('http://127.0.0.1:5001/api/sms/logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('Total SMS logs fetched:', logsRes.data.length);
        const mockLog = logsRes.data.find(l => l.id === 43 || l.message.includes('Verification mock'));
        if (mockLog) {
            console.log('SUCCESS: Found the mock log!');
            console.log('Details:', mockLog.details);
        } else {
            console.log('FAILURE: Mock log not found.');
            console.log('First log:', JSON.stringify(logsRes.data[0], null, 2));
        }

        console.log('\nFetching system logs...');
        const activityRes = await axios.get('http://127.0.0.1:5001/api/admin/activity-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Total Activity logs fetched:', activityRes.data.length);
        if (activityRes.data.length > 0) {
            console.log('First activity log details:', activityRes.data[0].details);
        }

    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

verifyAPI();
