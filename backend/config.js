module.exports = {
    SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret',
    MEMBER_SECRET: process.env.MEMBER_JWT_SECRET || 'fallback_member_secret',
    PORT: process.env.PORT || 5001
};
