/**
 * Security middleware to sanitize user inputs and prevent XSS.
 */
function sanitizeInput(req, res, next) {
    if (req.body) {
        for (let key in req.body) {
            if (typeof req.body[key] === 'string') {
                // Basic sanitization: remove <script> tags and other dangerous HTML
                // We allow some basic characters but strip out potential injection patterns
                req.body[key] = req.body[key]
                    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                    .replace(/on\w+="[^"]*"/gim, "") // Remove onmouseover, onclick, etc.
                    .trim();
            }
        }
    }
    next();
}

module.exports = sanitizeInput;
