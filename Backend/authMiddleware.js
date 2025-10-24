// authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // 1. Get token from the header
    const token = req.header('Authorization');

    // 2. Check if no token
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // 3. Verify token
    try {
        // The token will be sent as "Bearer [token]", so we split it
        const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);

        // Add user from payload to the request object
        req.user = decoded.user;
        next(); // Move on to the next function (the API endpoint)
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};