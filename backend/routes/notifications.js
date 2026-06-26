const express = require('express');
const router = express.Router();
const { dbAll, dbRun, dbGet } = require('../utils/helpers');

/**
 * Common handler for retrieving notifications.
 * It detects if the caller is an Admin or Member via the request object.
 */
const getMyNotifications = async (req, res) => {
    try {
        const userId = req.admin ? req.admin.id : (req.member ? req.member.id : null);
        const userType = req.admin ? 'admin' : (req.member ? 'member' : null);
        
        if (!userId) {
            return res.status(401).json({ error: 'Session authentication required.' });
        }

        const notifications = await dbAll(
            `SELECT * FROM notifications 
             WHERE userId = ? AND userType = ? 
             ORDER BY timestamp DESC LIMIT 25`,
            [userId, userType]
        );

        const unreadCount = await dbGet(
            `SELECT COUNT(*) as count FROM notifications 
             WHERE userId = ? AND userType = ? AND isRead = 0`,
            [userId, userType]
        );
        
        res.json({ notifications, unreadCount: unreadCount?.count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Mark a specific notification as read.
 */
const markAsRead = async (req, res) => {
    try {
        const userId = req.admin ? req.admin.id : (req.member ? req.member.id : null);
        const userType = req.admin ? 'admin' : (req.member ? 'member' : null);
        
        await dbRun(
            `UPDATE notifications SET isRead = 1 
             WHERE id = ? AND userId = ? AND userType = ?`,
            [req.params.id, userId, userType]
        );
        
        res.json({ message: 'Notification closed.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Mark all current notifications as read for the logged-in user.
 */
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.admin ? req.admin.id : (req.member ? req.member.id : null);
        const userType = req.admin ? 'admin' : (req.member ? 'member' : null);
        
        await dbRun(
            `UPDATE notifications SET isRead = 1 
             WHERE userId = ? AND userType = ?`,
            [userId, userType]
        );
        
        res.json({ message: 'All notifications cleared.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Route definition
router.get('/', getMyNotifications);
router.put('/:id/read', markAsRead);
router.post('/read-all', markAllAsRead);

module.exports = router;
