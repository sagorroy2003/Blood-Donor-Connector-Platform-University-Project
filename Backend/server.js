require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");
const authMiddleware = require("./authMiddleware");

const app = express();
const PORT = process.env.PORT || 3001;

// --- 1. Middleware ---
app.use(cors());
app.use(express.json());

// --- 2. Database Configuration ---
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000,
    ssl: {}, // Secure connection for TiDB/Cloud DBs
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
};

const pool = mysql.createPool(dbConfig);

// Database Connection Test
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("🚀 [DB]: Database connected successfully to:", dbConfig.host);
        connection.release();
    } catch (err) {
        console.error("❌ [DB Error]: Initial connection failed:", err.message);
    }
})();

// --- 3. Helper Functions ---
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- 4. Public Endpoints ---

/** Health Check for Render/Deployment */
app.get("/", (req, res) => {
    res.status(200).json({ status: "online", message: "Blood Donor Connector API is running." });
});

/** Fetch Public Active Requests for Homepage */
app.get("/api/requests/public", async (req, res) => {
    try {
        const sql = `
            SELECT br.request_id, br.city, br.reason, br.date_needed, br.date_requested, 
                   u.name AS recipient_name, bt.type AS blood_type
            FROM BloodRequests br
            JOIN Users u ON br.recipient_id = u.user_id
            JOIN BloodTypes bt ON br.blood_type_id = bt.blood_type_id
            WHERE br.status = 'active'
            ORDER BY br.date_requested DESC LIMIT 8
        `;
        const [requests] = await pool.query(sql);
        res.json(requests);
    } catch (err) {
        console.error("❌ [API]: Error fetching public requests:", err.message);
        res.status(500).json({ message: "Server error fetching public data" });
    }
});

/** Static Blood Types List */
app.get("/api/bloodtypes", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM BloodTypes ORDER BY blood_type_id");
        res.json(rows);
    } catch (err) {
        console.error("❌ [API]: Error fetching blood types:", err.message);
        res.status(500).json({ message: "Error fetching blood types" });
    }
});

// --- 5. Authentication & User Management ---

/** User Registration with Email Verification */
app.post("/api/register", async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { name, email, password, date_of_birth, blood_type_id, contact_phone, city } = req.body;

        if (!name || !email || !password || !city) {
            return res.status(400).json({ message: "Missing required fields." });
        }

        const [existingUserRows] = await connection.query("SELECT user_id, is_verified FROM Users WHERE email = ?", [email]);
        const existingUser = existingUserRows[0];

        // Phone Duplicate Check
        if (contact_phone) {
            let phoneQuery = "SELECT user_id FROM Users WHERE contact_phone = ?";
            const params = [contact_phone];
            if (existingUser) {
                phoneQuery += " AND user_id != ?";
                params.push(existingUser.user_id);
            }
            const [rows] = await connection.query(phoneQuery, params);
            if (rows.length > 0) {
                return res.status(409).json({ message: "Phone number already in use." });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const verificationToken = crypto.randomBytes(32).toString("hex");

        if (existingUser) {
            if (existingUser.is_verified) {
                return res.status(400).json({ message: "Email already verified." });
            }
            const updateSql = `UPDATE Users SET name=?, password_hash=?, date_of_birth=?, blood_type_id=?, contact_phone=?, city=?, verification_token=?, is_verified=FALSE WHERE user_id=?`;
            await connection.query(updateSql, [name, passwordHash, date_of_birth, blood_type_id || null, contact_phone || null, city, verificationToken, existingUser.user_id]);
        } else {
            const insertSql = `INSERT INTO Users (name, email, password_hash, date_of_birth, blood_type_id, contact_phone, city, is_verified, verification_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            await connection.query(insertSql, [name, email, passwordHash, date_of_birth, blood_type_id || null, contact_phone || null, city, false, verificationToken]);
        }

        // Email logic
        const frontendUrl = process.env.VERCEL_FRONTEND_URL || "http://localhost:5500";
        const emailMessage = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: "Verify Your Email",
            html: `<p>Hi ${name},</p><p>Please verify your account: <a href="${frontendUrl}/verify-email.html?token=${verificationToken}">Verify Email</a></p>`,
        };
        await sgMail.send(emailMessage);

        await connection.commit();
        res.status(201).json({ message: "Registration successful! Please check your email." });
    } catch (err) {
        await connection.rollback();
        console.error("❌ [Registration Error]:", err.message);
        res.status(500).json({ message: "Registration failed." });
    } finally {
        connection.release();
    }
});

/** Email Verification */
app.get("/api/verify-email", async (req, res) => {
    try {
        const { token } = req.query;
        const [rows] = await pool.query("SELECT user_id, is_verified FROM Users WHERE verification_token = ?", [token]);
        const user = rows[0];

        if (!user) return res.status(400).json({ message: "Invalid or expired token." });
        if (user.is_verified) return res.status(200).json({ message: "Already verified." });

        await pool.query("UPDATE Users SET is_verified = TRUE, verification_token = NULL WHERE user_id = ?", [user.user_id]);
        res.status(200).json({ message: "Verification successful!" });
    } catch (err) {
        res.status(500).json({ message: "Error verifying email." });
    }
});

/** User Login */
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await pool.query("SELECT * FROM Users WHERE email = ?", [email]);
        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        if (!user.is_verified) return res.status(401).json({ message: "Account not verified." });

        const token = jwt.sign({ id: user.user_id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: "3h" });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: "Login failed." });
    }
});

/** Forgot Password */
app.post("/api/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const [rows] = await pool.query("SELECT user_id, name, is_verified FROM Users WHERE email = ?", [email]);
        const user = rows[0];

        if (user && user.is_verified) {
            const token = crypto.randomBytes(32).toString("hex");
            const expires = new Date(Date.now() + 15 * 60 * 1000);
            await pool.query("UPDATE Users SET verification_token=?, reset_token_expires=? WHERE user_id=?", [token, expires, user.user_id]);
            
            const frontendUrl = process.env.VERCEL_FRONTEND_URL || "http://localhost:5500";
            await sgMail.send({
                to: email,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: "Password Reset Request",
                html: `<p>Reset link (15 mins): <a href="${frontendUrl}/reset-password.html?token=${token}">Reset Password</a></p>`,
            });
        }
        res.json({ message: "If an account exists, a reset link has been sent." });
    } catch (err) {
        res.status(500).json({ message: "Error processing request." });
    }
});

/** Reset Password */
app.post("/api/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const [rows] = await pool.query("SELECT user_id FROM Users WHERE verification_token = ? AND reset_token_expires > NOW()", [token]);
        const user = rows[0];

        if (!user) return res.status(400).json({ message: "Token invalid or expired." });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);
        await pool.query("UPDATE Users SET password_hash=?, verification_token=NULL, reset_token_expires=NULL WHERE user_id=?", [hash, user.user_id]);
        res.json({ message: "Password reset successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// --- GET User Profile (Protected) ---
app.get("/api/profile", authMiddleware, async (req, res) => {
    try {
        // req.user.id comes from your authMiddleware
        const userId = req.user.id; 
        
        const [rows] = await pool.query(
            "SELECT user_id, name, email, date_of_birth, contact_phone, city, last_donation_date FROM Users WHERE user_id = ?",
            [userId]
        );
        
        if (!rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error("Profile fetch error:", err);
        res.status(500).json({ message: "Server error fetching profile" });
    }
});

// --- 6. Protected Blood Request Routes ---

/** Create Blood Request & Notify Eligible Donors */
app.post("/api/requests", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { blood_type_id, reason, city, date_needed } = req.body;
        const recipient_id = req.user.id;
        
        if (!blood_type_id || !city || !date_needed) {
            return res.status(400).json({ message: "Missing required fields." });
        }

        const [result] = await connection.query(
            "INSERT INTO BloodRequests (recipient_id, blood_type_id, city, reason, date_requested, status, date_needed) VALUES (?,?,?,?,NOW(),'active',?)",
            [recipient_id, blood_type_id, city, reason, date_needed]
        );
        const newRequestId = result.insertId;

        // Notification Logic
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const [donors] = await connection.query(
            "SELECT user_id, email, name FROM Users WHERE city=? AND blood_type_id=? AND user_id!=? AND (last_donation_date IS NULL OR last_donation_date <= ?) AND is_verified=TRUE",
            [city, blood_type_id, recipient_id, threeMonthsAgo]
        );

        if (donors.length > 0) {
            const [bloodType] = await connection.query("SELECT type FROM BloodTypes WHERE blood_type_id=?", [blood_type_id]);
            for (const donor of donors) {
                await sgMail.send({
                    to: donor.email,
                    from: process.env.SENDGRID_FROM_EMAIL,
                    subject: `Urgent: ${bloodType[0].type} needed in ${city}`,
                    html: `<p>A request has been made. Visit dashboard to accept.</p>`,
                });
                await connection.query("INSERT INTO RequestNotifications (request_id, donor_id, status) VALUES (?,?,'sent') ON DUPLICATE KEY UPDATE status='sent'", [newRequestId, donor.user_id]);
            }
        }

        await connection.commit();
        res.status(201).json({ message: "Request created and donors notified." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Error creating request." });
    } finally {
        connection.release();
    }
});

/** FIXED: Available Requests (Matching Donor's City) */
app.get("/api/requests/available", authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id;

        // 1. Get Donor City
        const [userRows] = await pool.query("SELECT city FROM Users WHERE user_id = ?", [donor_id]);
        if (!userRows[0]) return res.status(404).json({ message: "User not found." });

        const donorCity = userRows[0].city.trim();

        // 2. Fetch Matching Requests
        const sql = `
            SELECT br.*, u.name AS recipient_name, bt.type AS blood_type
            FROM BloodRequests br
            JOIN Users u ON br.recipient_id = u.user_id
            JOIN BloodTypes bt ON br.blood_type_id = bt.blood_type_id
            WHERE br.city = ? AND br.status = 'active' AND br.recipient_id != ?
            ORDER BY br.date_requested DESC
        `;
        const [requests] = await pool.query(sql, [donorCity, donor_id]);

        console.log(`🔎 [API]: Available requests for city "${donorCity}": ${requests.length}`);

        // --- FIX: Return the array directly (don't wrap in { requests: requests }) ---
        res.json(requests); 
    } catch (err) {
        console.error("❌ [API Error]:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * Donor: Accept a Blood Request
 * * Architecture & Optimizations:
 * - Transactional Integrity: Uses explicit DB transactions to prevent partial updates.
 * - Concurrent I/O: Uses Promise.all() to fetch donor and recipient profiles simultaneously.
 * - Fire-and-Forget Email: Non-blocking background execution for the SendGrid API.
 */
app.post("/api/requests/:requestId/accept", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // 1. Sanitize & Normalize Input (Using JS camelCase standards)
        const donorId = req.user.id || req.user.userId; 
        const requestId = req.params.requestId;

        // 2. Pessimistic Check: Verify Request State
        const [requestRows] = await connection.query(
            "SELECT status, recipient_id FROM BloodRequests WHERE request_id = ?", 
            [requestId]
        );
        
        const bloodRequest = requestRows[0];
        
        if (!bloodRequest || bloodRequest.status !== "active") {
            await connection.rollback(); 
            return res.status(400).json({ message: "Request is no longer active or does not exist." });
        }

        // 3. Execute Core Business Logic (State changes)
        await connection.query(
            "UPDATE BloodRequests SET status = 'on_hold' WHERE request_id = ?", 
            [requestId]
        );
        
        await connection.query(
            "INSERT INTO RequestNotifications (request_id, donor_id, status) VALUES (?, ?, 'accepted') ON DUPLICATE KEY UPDATE status='accepted'", 
            [requestId, donorId]
        );

        // 4. Concurrent Data Fetching (Optimization)
        // Promise.all executes both queries simultaneously, reducing database round-trip time.
        const [ [recipRows], [donorRows] ] = await Promise.all([
            connection.query("SELECT email, name FROM Users WHERE user_id = ?", [bloodRequest.recipient_id]),
            connection.query("SELECT name, contact_phone FROM Users WHERE user_id = ?", [donorId])
        ]);

        const recipient = recipRows[0];
        const donor = donorRows[0];

        // 5. Third-Party Integrations (Fire-and-Forget Pattern)
        if (recipient && recipient.email) {
            sgMail.send({
                to: recipient.email,
                from: process.env.SENDGRID_FROM_EMAIL,
                subject: "Urgent: A Donor Accepted Your Blood Request!",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                        <h2 style="color: #d32f2f;">Great News, ${recipient.name}!</h2>
                        <p style="font-size: 16px;"><strong>${donor.name}</strong> has accepted your blood request.</p>
                        <p style="font-size: 16px;">Please contact them immediately at: <strong>${donor.contact_phone || "No phone number provided"}</strong></p>
                    </div>
                `,
            })
            .then(() => console.log(`[Email] Background trigger success for ${recipient.email}`))
            .catch(err => {
                // Silently logs the 401 Unauthorized error since the free trial expired
                console.error("🚨 [Email] Background SendGrid Error:", err.response ? err.response.body : err.message);
            });
        }

        // 6. Finalize Transaction
        await connection.commit();
        res.json({ message: "Request accepted successfully!" });

    } catch (err) {
        // Force the server to print the exact crash reason while returning a safe 500 error to the client
        await connection.rollback();
        console.error("🚨 CRITICAL ACCEPT CRASH:", err); 
        res.status(500).json({ message: "Internal server error during acceptance." });
    } finally {
        // Always release the connection back to the pool to prevent memory leaks
        connection.release();
    }
});

/** Recipient: Mark a Request as Fulfilled */
app.post("/api/requests/:requestId/fulfill", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const recipient_id = req.user.id || req.user.userId;
        const request_id = req.params.requestId;

        // 1. Verify the current user actually owns this request
        const [request] = await connection.query(
            "SELECT status FROM BloodRequests WHERE request_id = ? AND recipient_id = ?", 
            [request_id, recipient_id]
        );
        
        if (!request[0] || request[0].status !== 'on_hold') {
            await connection.rollback();
            return res.status(400).json({ message: "Request cannot be fulfilled right now." });
        }

        // 2. Find which donor accepted it
        const [notif] = await connection.query(
            "SELECT donor_id FROM RequestNotifications WHERE request_id = ? AND status = 'accepted'", 
            [request_id]
        );
        
        if (!notif[0]) {
            await connection.rollback();
            return res.status(400).json({ message: "No accepted donor found for this request." });
        }
        
        const donor_id = notif[0].donor_id;

        // 3. Close the request
        await connection.query(
            "UPDATE BloodRequests SET status = 'fulfilled' WHERE request_id = ?", 
            [request_id]
        );

        // 4. Create the official Donation Record (This makes it appear in the donor's history!)
        await connection.query(
            "INSERT INTO donations (donor_id, recipient_id, request_id, donation_date) VALUES (?, ?, ?, CURDATE())",
            [donor_id, recipient_id, request_id]
        );

        await connection.commit();
        res.json({ message: "Request fulfilled! Thank you to the donor." });

    } catch (err) {
        await connection.rollback();
        console.error("🚨 CRITICAL FULFILL CRASH:", err);
        res.status(500).json({ message: "Server error fulfilling request." });
    } finally {
        connection.release();
    }
});

/** Recipient: Cancel the Accepted Donor */
app.post("/api/requests/:requestId/cancel-donor", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const recipient_id = req.user.id || req.user.userId;
        const request_id = req.params.requestId;

        // 1. Verify the user owns this request
        const [request] = await connection.query(
            "SELECT status FROM BloodRequests WHERE request_id = ? AND recipient_id = ?", 
            [request_id, recipient_id]
        );
        
        if (!request[0] || request[0].status !== 'on_hold') {
            await connection.rollback();
            return res.status(400).json({ message: "Cannot cancel donor at this time." });
        }

        // 2. Set the BloodRequest back to 'active' so it appears on the public feed again
        await connection.query(
            "UPDATE BloodRequests SET status = 'active' WHERE request_id = ?", 
            [request_id]
        );

        // 3. Update the notification so the donor sees it was cancelled
        await connection.query(
            "UPDATE RequestNotifications SET status = 'cancelled' WHERE request_id = ? AND status = 'accepted'", 
            [request_id]
        );

        await connection.commit();
        res.json({ message: "Donor cancelled. Your request is now public again." });

    } catch (err) {
        await connection.rollback();
        console.error("🚨 CRITICAL CANCEL-DONOR CRASH:", err);
        res.status(500).json({ message: "Server error cancelling donor." });
    } finally {
        connection.release();
    }
});

/** Donor: Cancel an Accepted Request */
app.post("/api/requests/:requestId/cancel-acceptance", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const donor_id = req.user.id || req.user.userId;
        const request_id = req.params.requestId;

        // 1. Verify this donor actually accepted it
        const [notif] = await connection.query(
            "SELECT status FROM RequestNotifications WHERE request_id = ? AND donor_id = ?", 
            [request_id, donor_id]
        );
        
        if (!notif[0] || notif[0].status !== 'accepted') {
            await connection.rollback();
            return res.status(400).json({ message: "You have not accepted this request." });
        }

        // 2. Set BloodRequest back to 'active'
        await connection.query(
            "UPDATE BloodRequests SET status = 'active' WHERE request_id = ?", 
            [request_id]
        );
        
        // 3. Update notification to cancelled so it stops showing in "My Accepted Commitments"
        await connection.query(
            "UPDATE RequestNotifications SET status = 'cancelled' WHERE request_id = ? AND donor_id = ?", 
            [request_id, donor_id]
        );

        await connection.commit();
        res.json({ message: "Acceptance cancelled. Request is public again." });

    } catch (err) {
        await connection.rollback();
        console.error("🚨 CRITICAL CANCEL CRASH:", err);
        res.status(500).json({ message: "Internal server error during cancellation." });
    } finally {
        connection.release();
    }
});

/** Donor: Get My Donation History */
app.get("/api/donations/myhistory", authMiddleware, async (req, res) => {
    try {
        const donorId = req.user.id || req.user.userId;
        
        const [history] = await pool.query(`
            SELECT 
                d.donation_date, 
                br.city, 
                br.reason, 
                u.name as recipient_name, 
                bt.type as blood_type_donated
            FROM donations d
            JOIN BloodRequests br ON d.request_id = br.request_id
            JOIN users u ON d.recipient_id = u.user_id
            JOIN bloodtypes bt ON br.blood_type_id = bt.blood_type_id
            WHERE d.donor_id = ?
            ORDER BY d.donation_date DESC
        `, [donorId]);

        res.json(history);
    } catch (err) {
        console.error("🚨 CRITICAL HISTORY CRASH:", err);
        res.status(500).json({ message: "Failed to load donation history." });
    }
});

/** Delete Request (Recipient Action) */
app.delete("/api/requests/:requestId", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const request_id = req.params.requestId;
        const recipient_id = req.user.id;

        const [row] = await connection.query("SELECT recipient_id FROM BloodRequests WHERE request_id=?", [request_id]);
        if (!row[0] || row[0].recipient_id !== recipient_id) {
            return res.status(403).json({ message: "Forbidden" });
        }

        await connection.query("DELETE FROM RequestNotifications WHERE request_id=?", [request_id]);
        await connection.query("DELETE FROM Donations WHERE request_id=?", [request_id]);
        await connection.query("DELETE FROM BloodRequests WHERE request_id=?", [request_id]);

        await connection.commit();
        res.json({ message: "Deleted" });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Error" });
    } finally {
        connection.release();
    }
});

/** Get My Requests */
app.get("/api/requests/myrequests", authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT br.*, bt.type AS blood_type FROM BloodRequests br JOIN BloodTypes bt ON br.blood_type_id=bt.blood_type_id WHERE br.recipient_id=? ORDER BY br.date_requested DESC", [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Error" });
    }
});

/** Get My Accepted Requests (Donor Action) */
app.get("/api/requests/accepted", authMiddleware, async (req, res) => {
    try {
        const sql = `SELECT br.request_id, br.city, br.reason, br.date_requested, br.status AS request_status, 
                    u.name AS recipient_name, u.contact_phone AS recipient_phone, bt.type AS blood_type
                    FROM RequestNotifications rn JOIN BloodRequests br ON rn.request_id=br.request_id
                    JOIN Users u ON br.recipient_id=u.user_id JOIN BloodTypes bt ON br.blood_type_id=bt.blood_type_id
                    WHERE rn.donor_id=? AND rn.status='accepted' AND br.status='on_hold'`;
        const [rows] = await pool.query(sql, [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Error" });
    }
});

// --- Start Server ---
app.listen(PORT, () => console.log(`🚀 [Server]: Server running on port ${PORT}`));