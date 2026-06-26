const db = require('../database');

function logActivity(action, entity, entityId, details, performer = 'Admin') {
    const ts = new Date().toISOString();
    db.run(
        `INSERT INTO activity_log (action, entity, entity_id, details, performed_by, timestamp) VALUES (?,?,?,?,?,?)`,
        [action, entity, String(entityId || ''), details || '', performer, ts]
    );
}

module.exports = { logActivity };
