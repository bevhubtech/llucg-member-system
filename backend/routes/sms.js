const express = require('express');
const router = express.Router();
const { dbAll, dbRun, dbGet } = require('../utils/helpers');
const { authRequired, memberAuthRequired } = require('../middleware/auth');

// Get all campaigns
router.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await dbAll('SELECT * FROM sms_campaigns ORDER BY scheduledAt DESC');
        res.json({ campaigns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create/Schedule a campaign
router.post('/campaigns', authRequired, async (req, res) => {
    const { title, message, audience, scheduledAt } = req.body;
    if (!title || !message || !scheduledAt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await dbRun(
            `INSERT INTO sms_campaigns (title, message, audience, scheduledAt, createdBy, timestamp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title, message, audience || 'all', scheduledAt, req.admin.username, new Date().toISOString()]
        );
        res.json({ success: true, message: 'Campaign scheduled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel a scheduled campaign
router.post('/campaigns/:id/cancel', authRequired, async (req, res) => {
    try {
        const campaign = await dbGet('SELECT * FROM sms_campaigns WHERE id = ?', [req.params.id]);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
        if (campaign.status !== 'scheduled') return res.status(400).json({ error: 'Only scheduled campaigns can be cancelled' });

        await dbRun('UPDATE sms_campaigns SET status = "cancelled" WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Campaign cancelled' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a campaign
router.delete('/campaigns/:id', authRequired, async (req, res) => {
    try {
        await dbRun('DELETE FROM sms_campaigns WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Campaign record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
