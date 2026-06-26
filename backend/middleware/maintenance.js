const { getMaintenanceStatus } = require('../utils/helpers');

async function maintenanceMiddleware(req, res, next) {
    // 1. Check if maintenance mode is enabled in DB
    const maintenance = await getMaintenanceStatus();
    if (!maintenance.enabled) return next();

    // 2. Define non-critical paths that are ALWAYS allowed (e.g., Auth, System Control)
    const allowedPaths = [
        '/api/auth/login',
        '/api/auth/2fa',
        '/api/system/health',
        '/api/system/maintenance', // Allow toggling off
        '/api/admin/me'
    ];

    const isAllowedPath = allowedPaths.some(p => req.path.startsWith(p));
    if (isAllowedPath) return next();

    // 3. Check if user is ICT or Superadmin (they bypass maintenance)
    // We check req.admin which is populated by authRequired middleware
    const isTechnicalAdmin = req.admin && ['superadmin', 'ict_admin'].includes(req.admin.role);
    if (isTechnicalAdmin) return next();

    // 4. Otherwise, block the request
    res.status(503).json({ 
        error: 'System Maintenance', 
        message: maintenance.message || 'The Member Portal is currently undergoing essential system maintenance to enhance security and performance. Access to member services is temporarily restricted while we finalize these optimizations.',
        resolution: maintenance.resolution || 'shortly'
    });
}

module.exports = maintenanceMiddleware;
