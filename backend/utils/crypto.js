const crypto = require('crypto');
const { SECRET } = require('../config');

// Derive a static 32-byte key deterministically from the application SECRET
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(SECRET)).digest();

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} text - The plaintext strictly to encrypt.
 * @returns {object} { iv, encryptedData, authTag } all in hex format.
 */
function encryptDM(text) {
    if (!text) return { iv: '', encryptedData: '', authTag: '' };
    
    // 12 bytes is the recommended IV size for GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    
    let encryptedData = cipher.update(text, 'utf8', 'hex');
    encryptedData += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
        iv: iv.toString('hex'),
        encryptedData,
        authTag
    };
}

/**
 * Decrypt a cipher text using AES-256-GCM.
 * @param {object} payload - { iv, encryptedData, authTag } in hex format.
 * @returns {string} The original plaintext. Throws if auth tag fails.
 */
function decryptDM({ iv, encryptedData, authTag }) {
    if (!encryptedData) return '';
    try {
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            ENCRYPTION_KEY,
            Buffer.from(iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption failed, possible data corruption or key mismatch:', err.message);
        return '[Encrypted Message]';
    }
}

module.exports = {
    encryptDM,
    decryptDM
};
