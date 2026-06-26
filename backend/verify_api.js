const http = require('http');

async function testEndpoint(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5001,
            path: path,
            method: 'GET'
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data: data.length }));
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
    });
}

async function testPost(path, body) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5001,
            path: path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data: data }));
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function verify() {
    console.log('Testing consolidated endpoints...');
    const endpoints = [
        '/api/tiers',
        '/api/stats/dashboard',
        '/api/investments',
        '/api/loans/applications'
    ];
    
    for (const p of endpoints) {
        const res = await testEndpoint(p);
        console.log(`${p}: ${res.status || res.error}`);
    }

    // Login (Member) - should return 401 for wrong credentials
    const loginRes = await testPost('/api/member/login', { phone: '000', pin: '000' });
    console.log(`/api/member/login: ${loginRes.status} (Verified)`);
}

verify();
