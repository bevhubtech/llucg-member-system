const express = require('express');
const router  = express.Router();
const { dbAll, dbGet, dbRun } = require('../utils/helpers');
const { authRequired } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

// Get all investments
router.get('/', authRequired, async (req, res) => {
    try {
        res.json({ investments: await dbAll('SELECT * FROM investments ORDER BY purchaseDate DESC') });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Portfolio stats
router.get('/stats', authRequired, async (req, res) => {
    try {
        const totals = await dbGet(`
            SELECT 
                COALESCE(SUM(amountInvested),0) as totalInvested, 
                COALESCE(SUM(currentValue),0) as currentTotal 
            FROM investments WHERE status = 'active'
        `);
        const profit = totals.currentTotal - totals.totalInvested;
        const roi = totals.totalInvested > 0 ? (profit / totals.totalInvested) * 100 : 0;
        
        // Asset breakdown by type
        const byType = await dbAll(`
            SELECT type, COUNT(*) as count, 
                COALESCE(SUM(amountInvested),0) as invested, 
                COALESCE(SUM(currentValue),0) as valuation 
            FROM investments WHERE status = 'active' 
            GROUP BY type ORDER BY valuation DESC
        `);

        // Top performer
        const topAsset = await dbGet(`
            SELECT name, type, amountInvested, currentValue,
                ROUND(((currentValue - amountInvested) * 100.0 / NULLIF(amountInvested, 0)), 1) as roi
            FROM investments WHERE status = 'active' AND amountInvested > 0
            ORDER BY roi DESC LIMIT 1
        `);

        // Count metrics
        const counts = await dbGet(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as liquidated
            FROM investments
        `);

        // 12% Benchmark Calculation
        const targetYield = 12.0;
        const targetGrowth = totals.totalInvested * (targetYield / 100);

        // Concentration Risk (Herfindahl-Hirschman Index - HHI)
        // HHI < 1500: Healthy, 1500-2500: Moderate, > 2500: High Risk
        let hhi = 0;
        if (totals.currentTotal > 0) {
            byType.forEach(t => {
                const share = (t.valuation / totals.currentTotal) * 100;
                hhi += (share * share);
            });
        }

        // Dividend integration
        const dividends = await dbGet("SELECT COALESCE(SUM(totalPoolAmount), 0) as total FROM dividends");

        res.json({ 
            totalInvested: totals.totalInvested, 
            currentTotal: totals.currentTotal, 
            profit, 
            roi,
            byType,
            topAsset,
            counts,
            risk: {
                hhi: Math.round(hhi),
                status: hhi > 2500 ? 'High' : hhi > 1500 ? 'Moderate' : 'Healthy'
            },
            benchmarks: {
                targetYield,
                targetGrowth,
                performance: roi >= targetYield ? 'Exceeding' : 'Trailing'
            },
            payouts: {
                totalDividends: dividends.total
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create investment
router.post('/', authRequired, async (req, res) => {
    const { name, type, amountInvested, currentValue, purchaseDate, notes } = req.body;
    if (!name || !type || !amountInvested) return res.status(400).json({ error: 'Required fields missing.' });
    try {
        const timestamp = new Date().toISOString();
        const r = await dbRun(
            'INSERT INTO investments (name, type, amountInvested, currentValue, purchaseDate, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [name, type, amountInvested, currentValue || amountInvested, purchaseDate || timestamp, notes || '']
        );

        // Record as Outflow (Debit) from the group pool
        await dbRun(
            `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference) VALUES ('debit', ?, ?, ?, ?, ?)`,
            [amountInvested, `Asset Acquisition: ${name}`, req.admin?.username || 'Admin', timestamp, `INV-PURCH-${r.lastID}`]
        );

        logActivity('Created Investment', 'Investment', r.lastID, `${name} - KES ${amountInvested}`, req.admin?.username);
        res.json({ id: r.lastID, name, type, amountInvested, currentValue: currentValue || amountInvested, purchaseDate, status: 'active' });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// Update investment
router.put('/:id', authRequired, async (req, res) => {
    const { name, type, currentValue, status, notes } = req.body;
    try {
        const old = await dbGet('SELECT status, currentValue, name, amountInvested FROM investments WHERE id = ?', [req.params.id]);
        await dbRun('UPDATE investments SET name=?, type=?, currentValue=?, status=?, notes=? WHERE id=?',
            [name, type, currentValue, status, notes || '', req.params.id]);
        
        // If status changed to sold, record the Inflow (Credit)
        if (status === 'sold' && old.status !== 'sold') {
            const timestamp = new Date().toISOString();
            // Record Principal Returned
            await dbRun(
                `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
                [old.amountInvested, `Asset Liquidated (Principal Returned): ${old.name}`, req.admin?.username || 'Admin', timestamp, `INV-SALE-${req.params.id}`, 'Institutional Reserves']
            );
            // Record Profit
            const profit = (currentValue || old.currentValue) - old.amountInvested;
            if (profit > 0) {
                await dbRun(
                    `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('credit', ?, ?, ?, ?, ?, ?)`,
                    [profit, `Asset Liquidated (Profit): ${old.name}`, req.admin?.username || 'Admin', timestamp, `INV-SALE-PROFIT-${req.params.id}`, 'Investment Profits']
                );
            } else if (profit < 0) {
                await dbRun(
                    `INSERT INTO transactions (type, amount, description, performed_by, timestamp, reference, fund) VALUES ('debit', ?, ?, ?, ?, ?, ?)`,
                    [Math.abs(profit), `Asset Liquidated (Loss): ${old.name}`, req.admin?.username || 'Admin', timestamp, `INV-SALE-LOSS-${req.params.id}`, 'Institutional Reserves']
                );
            }
        }

        logActivity('Updated Investment', 'Investment', req.params.id, `Updated ${name}`, req.admin?.username);
        res.json({ message: 'Investment updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete investment
router.delete('/:id', authRequired, async (req, res) => {
    try {
        const asset = await dbGet('SELECT name FROM investments WHERE id = ?', [req.params.id]);
        await dbRun('DELETE FROM investment_history WHERE investmentId = ?', [req.params.id]);
        await dbRun('DELETE FROM investments WHERE id = ?', [req.params.id]);
        logActivity('Deleted Investment', 'Investment', req.params.id, `Deleted ${asset?.name || 'Unknown'}`, req.admin?.username);
        res.json({ message: 'Asset deleted.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Valuation history (Single Asset)
router.get('/:id/history', authRequired, async (req, res) => {
    try {
        const history = await dbAll('SELECT * FROM investment_history WHERE investmentId = ? ORDER BY valuationDate ASC', [req.params.id]);
        res.json({ history });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Total Portfolio History (Aggregate)
router.get('/history/total', authRequired, async (req, res) => {
    try {
        // Fetch all valuation points across all assets
        const rawHistory = await dbAll(`
            SELECT h.valuationDate as date, h.value, i.name, i.id as assetId
            FROM investment_history h
            JOIN investments i ON h.investmentId = i.id
            ORDER BY h.valuationDate ASC
        `);

        // Pivot and group by date to get "Total Portfolio Value" snapshots
        const dates = [...new Set(rawHistory.map(h => h.date.split('T')[0]))].sort();
        const assets = await dbAll('SELECT id, name, amountInvested FROM investments');
        
        const totalHistory = dates.map(date => {
            let dailyTotal = 0;
            assets.forEach(asset => {
                // Find most recent valuation for this asset on or before this date
                const lastVal = rawHistory
                    .filter(h => h.assetId === asset.id && h.date.split('T')[0] <= date)
                    .pop();
                
                dailyTotal += lastVal ? lastVal.value : asset.amountInvested;
            });
            return { date, value: dailyTotal };
        });

        res.json({ history: totalHistory });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Record valuation
router.post('/:id/valuation', authRequired, async (req, res) => {
    const { value, valuationDate } = req.body;
    if (!value) return res.status(400).json({ error: 'Value required.' });
    try {
        await dbRun('INSERT INTO investment_history (investmentId, value, valuationDate) VALUES (?, ?, ?)',
            [req.params.id, value, valuationDate || new Date().toISOString()]);
        await dbRun('UPDATE investments SET currentValue = ? WHERE id = ?', [value, req.params.id]);
        logActivity('Valuation Recorded', 'Investment', req.params.id, `New value: KES ${value}`, req.admin?.username);
        res.json({ message: 'Valuation recorded.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
