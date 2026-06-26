const { dbRun } = require('./helpers');

/**
 * Creates a persistent notification for a user (Admin or Member).
 */
const createNotification = async (userId, userType, title, message, link = null, type = 'system') => {
    try {
        await dbRun(
            `INSERT INTO notifications (userId, userType, title, message, link, type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, userType, title, message, link, type, new Date().toISOString()]
        );
    } catch (err) { 
        console.error('Failed to create notification:', err); 
    }
};

module.exports = { createNotification };
