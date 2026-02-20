/**
 * authMiddleware.js
 * * Middleware to protect secure routes by validating JSON Web Tokens (JWT).
 * It extracts the token from the 'Authorization' header, verifies its authenticity, 
 * and attaches the decoded user payload to the request object.
 */
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    // 1. Extract the Authorization header
    const authHeader = req.header('Authorization');

    // 2. Defensive Check: Ensure header exists AND follows the standard "Bearer <token>" format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            message: 'Access denied. Missing or malformed authentication token.' 
        });
    }

    try {
        // 3. Extract the actual token string (Splits "Bearer eyJhbG..." and takes the 2nd part)
        const token = authHeader.split(' ')[1];

        // 4. Verify the token against your server's secret key
        // If it's expired or tampered with, this will automatically throw an error to the catch block
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 5. Attach the entire decoded payload to the request object
        // Example: req.user will now equal { id: 5, name: "Sagor", email: "..." }
        req.user = decoded;
        
        // 6. Pass control to the next middleware or the actual route handler
        next();
        
    } catch (err) {
        // Token verification failed (e.g., expired token, wrong secret, malformed string)
        console.error("[Auth Error] JWT Verification failed:", err.message); // Silently log for server admins
        
        return res.status(403).json({ 
            message: 'Session expired or token is invalid. Please log in again.' 
        });
    }
};