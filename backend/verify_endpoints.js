const http = require('http');

const options = [
    { port: 5001, path: '/api/sms/logs', method: 'GET' },
    { port: 5001, path: '/api/activity-log', method: 'GET' }
];

async function check(opt) {
    return new Promise((resolve) => {
        const req = http.request(opt, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`URL: ${opt.path}`);
                console.log(`Status: ${res.statusCode}`);
                try {
                    const json = JSON.parse(data);
                    console.log(`Valid JSON: Yes`);
                    console.log(`Keys: ${Object.keys(json).join(', ')}`);
                    if (json.logs) console.log(`Logs Count: ${json.logs.length}`);
                } catch (e) {
                    console.log(`Valid JSON: No`);
                    console.log(`Data (first 100 chars): ${data.substring(0, 100)}`);
                }
                console.log('---');
                resolve();
            });
        });
        req.on('error', (e) => {
            console.log(`URL: ${opt.path}`);
            console.log(`Error: ${e.message}`);
            console.log('---');
            resolve();
        });
        req.end();
    });
}

(async () => {
    for (const opt of options) {
        await check(opt);
    }
})();
