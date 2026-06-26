const http = require('http');

const TOKEN = process.argv[2] || '';

async function get(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5001,
            path,
            method: 'GET',
            headers: TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                let parsed = '(non-JSON)';
                try { parsed = JSON.parse(data); } catch(e) {}
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
    });
}

async function main() {
    console.log('=== API Endpoint Diagnostic ===\n');
    
    const endpoints = [
        '/api/tiers',
        '/api/members/tiers',
        '/api/stats/dashboard',
        '/api/stats',
        '/api/stats/forecast',
        '/api/reports/dashboard',
        '/api/members',
        '/api/investments',
        '/api/transactions',
        '/api/expenses',
        '/api/ict/performance',
        '/api/ict/unified-summary',
        '/api/ict/dividends',
        '/api/ict/rate-limits',
        '/api/system/health',
        '/api/ict/welfare/summary',
        '/api/ict/welfare/history',
    ];

    for (const path of endpoints) {
        const res = await get(path);
        const status = res.error ? `ERROR: ${res.error}` : res.status;
        const note = typeof res.data === 'object' && res.data !== null 
            ? (res.data.error || Object.keys(res.data).slice(0,3).join(', '))
            : '';
        console.log(`${String(status).padStart(3)} | ${path.padEnd(40)} | ${note}`);
    }
    
    process.exit(0);
}

main();
