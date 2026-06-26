const http = require('http');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTcsInVzZXJuYW1lIjoiZGV2X2FkbWluIiwicm9sZSI6InN1cGVyYWRtaW4iLCJpYXQiOjE3NzczNTg2NzYsImV4cCI6MTc3NzQwMTg3Nn0.iSWB95DApXlkdTiBOs7AM2UbdAk-vecfGrR5oM1zBho';

async function get(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5001,
            path,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch(e) { parsed = data.slice(0, 80); }
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.end();
    });
}

async function main() {
    console.log('=== Authenticated API Endpoint Diagnostic ===\n');
    
    const endpoints = [
        // Broken endpoint
        '/api/tiers',
        '/api/members/tiers',
        // Dashboard
        '/api/stats/dashboard',
        '/api/stats',
        '/api/stats/forecast',
        // Core data
        '/api/members',
        '/api/investments',
        '/api/transactions',
        '/api/expenses',
        // ICT
        '/api/ict/performance',
        '/api/ict/unified-summary',
        '/api/ict/dividends',
        '/api/ict/rate-limits',
        '/api/ict/welfare/summary',
        '/api/ict/welfare/history',
        '/api/ict/health-check',
        '/api/ict/cron/status',
        '/api/ict/vault',
        '/api/ict/audit-trail',
        '/api/ict/security-alerts',
        '/api/ict/sms-gateway',
        '/api/ict/portal-config',
        '/api/ict/config-history',
        '/api/ict/labels',
        '/api/ict/brand-identity',
        '/api/ict/rbac-status',
        '/api/ict/penalty-config',
        // System
        '/api/system/health',
        '/api/system/audit/logs',
        // Reports
        '/api/reports/savings-summary',
        '/api/reports/dashboard',
        // Other
        '/api/auth/users',
    ];

    for (const path of endpoints) {
        const res = await get(path);
        const status = res.error ? `ERR` : res.status;
        let note = '';
        if (res.data && typeof res.data === 'object') {
            if (res.data.error) note = `ERROR: ${res.data.error}`;
            else note = Object.keys(res.data).slice(0, 4).join(', ');
        } else if (typeof res.data === 'string') {
            note = res.data.slice(0, 60);
        }
        const icon = status === 200 || status === 304 ? '✓' : '✗';
        console.log(`${icon} ${String(status).padStart(3)} | ${path.padEnd(45)} | ${note}`);
    }
    
    process.exit(0);
}

main();
