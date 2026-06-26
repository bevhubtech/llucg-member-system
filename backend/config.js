module.exports = {
    SECRET: process.env.JWT_SECRET || (function(){ throw new Error("JWT_SECRET missing in environment") })(),
    MEMBER_SECRET: process.env.MEMBER_JWT_SECRET || (function(){ throw new Error("MEMBER_JWT_SECRET missing in environment") })(),
    PORT: process.env.PORT || 5001
};
