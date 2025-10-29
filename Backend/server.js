require("dotenv").config();
const crypto = require("crypto"); // <-- FIX 1: ADD THIS IMPORT
const sgMail = require("@sendgrid/mail");
const authMiddleware = require("./authMiddleware");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 3001; // Use environment port or default

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Database Connection Pool ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000, // Default to TiDB port
    ssl: {
        // Enable SSL/TLS for secure connection to TiDB Cloud
    },
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
});

// --- Test DB Connection on Startup ---
pool
    .getConnection()
    .then((connection) => {
        console.log("Successfully connected to the database!");
        connection.release();
    })
    .catch((err) => {
        console.error("Error connecting to database:", err);
        // Optional: Exit if DB connection fails on startup
        // process.exit(1);
    });

// --- API Endpoints ---

// GET Blood Types
app.get("/api/bloodtypes", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT * FROM BloodTypes ORDER BY blood_type_id"
        );
        res.json(rows);
    } catch (err) {
        console.error("Error fetching blood types:", err);
        res.status(500).json({ message: "Error fetching blood types" });
    }
});

// POST User Registration
app.post("/api/register", async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            name,
            email,
            password,
            date_of_birth,
            blood_type_id,
            contact_phone,
            city,
        } = req.body;

        // Basic validation (add more as needed)
        if (!name || !email || !password || !city) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ message: "Missing required fields." });
        }

        const [existingUser] = await connection.query(
            "SELECT user_id FROM Users WHERE email = ?",
            [email]
        );
        if (existingUser.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ message: "Email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const verificationToken = crypto.randomBytes(32).toString("hex");

        const sql = `
          INSERT INTO Users (name, email, password_hash, date_of_birth, blood_type_id, contact_phone, city, is_verified, verification_token)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(sql, [
            name,
            email,
            passwordHash,
            date_of_birth,
            blood_type_id || null,
            contact_phone || null,
            city,
            false,
            verificationToken,
        ]);

        // --- Send Verification Email ---
        // Ensure VERCEL_FRONTEND_URL is set in your Render environment variables (e.g., https://your-app.vercel.app)
        const frontendUrl =
            process.env.VERCEL_FRONTEND_URL || `http://localhost:5500`; // Fallback for local
        const verificationLink = `${frontendUrl}/verify-email.html?token=${verificationToken}`;

        sgMail.setApiKey(process.env.SENDGRID_API_KEY); // <-- FIX 2: SET API KEY HERE
        const emailMessage = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: "Verify Your Email for Blood Donor Connector",
            html: `
                <p>Hi ${name},</p>
                <p>Thank you for registering! Please click the link below to verify your email address:</p>
                <p><a href="${verificationLink}">${verificationLink}</a></p>
                <p>If you did not register, please ignore this email.</p>
            `,
        };

        try {
            await sgMail.send(emailMessage);
            console.log("Verification email sent to " + email);
        } catch (emailError) {
            console.error(
                "SendGrid Error during registration for " + email + ":",
                emailError.toString()
            );
            // Log error but allow registration to proceed for now
        }
        // --- End Send Email ---

        await connection.commit();
        connection.release();
        res
            .status(201)
            .json({
                message:
                    "Registration successful! Please check your email to verify your account.",
            });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error("Error during registration:", err);
        // Avoid sending detailed SQL errors to client
        if (
            err.code === "ER_NO_REFERENCED_ROW_2" ||
            err.code === "ER_NO_REFERENCED_ROW"
        ) {
            return res.status(400).json({ message: "Invalid Blood Type selected." });
        }
        res.status(500).json({ message: "Error registering user" });
    }
});

// GET Email Verification Handler
app.get("/api/verify-email", async (req, res) => {
    try {
        const { token } = req.query;
        if (!token)
            return res
                .status(400)
                .json({ message: "Verification token is missing." });

        const [rows] = await pool.query(
            "SELECT user_id, is_verified FROM Users WHERE verification_token = ?",
            [token]
        );
        const user = rows[0];

        if (!user)
            return res
                .status(400)
                .json({ message: "Invalid or expired verification token." });
        if (user.is_verified)
            return res
                .status(200)
                .json({ message: "Email already verified. You can log in." });

        await pool.query(
            "UPDATE Users SET is_verified = TRUE, verification_token = NULL WHERE user_id = ?",
            [user.user_id]
        );
        res
            .status(200)
            .json({ message: "Email verified successfully! You can now log in." });
    } catch (err) {
        console.error("Email verification error:", err);
        res.status(500).json({ message: "Error verifying email." });
    }
});

// POST User Login
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ message: "Email and password required." });

        const [rows] = await pool.query("SELECT * FROM Users WHERE email = ?", [
            email,
        ]);
        const user = rows[0];
        if (!user)
            return res.status(400).json({ message: "Invalid email or password" });

        if (!user.is_verified)
            return res
                .status(401)
                .json({ message: "Account not verified. Please check your email." });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid email or password" });

        const payload = {
            user: { id: user.user_id, name: user.name, email: user.email },
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: "3h",
        });
        res.json({ token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error during login" });
    }
});

// GET User Profile (Protected)
app.get("/api/profile", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            "SELECT user_id, name, email, date_of_birth, contact_phone, city, last_donation_date FROM Users WHERE user_id = ?",
            [userId]
        );
        if (!rows[0]) return res.status(404).json({ message: "User not found" });
        res.json(rows[0]);
    } catch (err) {
        console.error("Profile fetch error:", err);
        res.status(500).json({ message: "Server error fetching profile" });
    }
});

// POST Create Blood Request (Protected)
app.post("/api/requests", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { blood_type_id, reason, city } = req.body;
        if (!blood_type_id || !city) {
            await connection.rollback();
            connection.release();
            return res
                .status(400)
                .json({ message: "Blood type and city are required." });
        }

        const recipient_id = req.user.id;
        const date_requested = new Date();
        const status = "active";

        const insertSql = `
          INSERT INTO BloodRequests (recipient_id, blood_type_id, city, reason, date_requested, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [insertResult] = await connection.query(insertSql, [
            recipient_id,
            blood_type_id,
            city,
            reason || null,
            date_requested,
            status,
        ]);
        const newRequestId = insertResult.insertId;

        // --- Notification Logic ---
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const findDonorsSql = `
            SELECT user_id, email, name FROM Users
            WHERE city = ? AND blood_type_id = ? AND user_id != ?
              AND (last_donation_date IS NULL OR last_donation_date <= ?)
              AND is_verified = TRUE  -- Only notify verified users
        `;
        const [eligibleDonors] = await connection.query(findDonorsSql, [
            city,
            blood_type_id,
            recipient_id,
            threeMonthsAgo,
        ]);

        if (eligibleDonors.length > 0) {
            console.log(
                `Found ${eligibleDonors.length} eligible donors. Preparing emails...`
            );
            const [recipientData] = await connection.query(
                "SELECT name FROM Users WHERE user_id = ?",
                [recipient_id]
            );
            const recipientName = recipientData[0]?.name || "Someone";
            const [bloodTypeData] = await connection.query(
                "SELECT type FROM BloodTypes WHERE blood_type_id = ?",
                [blood_type_id]
            );
            const bloodTypeName = bloodTypeData[0]?.type || "Unknown";

            sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Set key before loop

            for (const donor of eligibleDonors) {
                const emailMessage = {
          /* ... email content ... */ to: donor.email,
                    from: process.env.SENDGRID_FROM_EMAIL,
                    subject: `Urgent Blood Request: ${bloodTypeName} needed in ${city}`,
                    html: `<p>Hi ${donor.name
                        },</p><p>${recipientName} urgently needs <strong>${bloodTypeName}</strong> blood in <strong>${city}</strong>.</p><p>Reason: ${reason || "Not specified"
                        }</p><p>If you are available and eligible to donate, please log in to your account on the Blood Donor Connector platform to view and accept the request.</p><p>Thank you for your potential help!</p>`,
                };
                sgMail
                    .send(emailMessage)
                    .then(() => console.log("Email sent to " + donor.email))
                    .catch((error) =>
                        console.error(
                            "SendGrid Error for " + donor.email + ":",
                            error.toString()
                        )
                    );

                const notificationSql = `
                    INSERT INTO RequestNotifications (request_id, donor_id, status) VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE status = ?
                `;
                await connection.query(notificationSql, [
                    newRequestId,
                    donor.user_id,
                    "sent",
                    "sent",
                ]);
            }
        } else {
            console.log("No eligible donors found for this request.");
        }
        // --- End Notification Logic ---

        await connection.commit();
        connection.release();
        res.status(201).json({ message: "Blood request created successfully!" }); // Simpler message back
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error("Error creating request or sending notifications:", err);
        if (
            err.code === "ER_NO_REFERENCED_ROW_2" ||
            err.code === "ER_NO_REFERENCED_ROW"
        ) {
            return res.status(400).json({ message: "Invalid Blood Type selected." });
        }
        res.status(500).json({ message: "Server error while creating request" });
    }
});

// GET User's Own Requests (Protected)
app.get("/api/requests/myrequests", authMiddleware, async (req, res) => {
    try {
        const recipient_id = req.user.id;
        const sql = `
          SELECT br.*, bt.type AS blood_type FROM BloodRequests AS br
          JOIN BloodTypes AS bt ON br.blood_type_id = bt.blood_type_id
          WHERE br.recipient_id = ? ORDER BY br.date_requested DESC
        `;
        const [requests] = await pool.query(sql, [recipient_id]);
        res.json(requests);
    } catch (err) {
        console.error("Error fetching user's requests:", err);
        res.status(500).json({ message: "Server error fetching requests" });
    }
});

// GET Available Requests for Donor (Protected)
app.get("/api/requests/available", authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id;
        const [userRows] = await pool.query(
            "SELECT city, blood_type_id, last_donation_date FROM Users WHERE user_id = ?",
            [donor_id]
        );
        if (!userRows[0])
            return res.status(404).json({ message: "Donor profile not found" });

        const { city, blood_type_id, last_donation_date } = userRows[0];

        let isEligible = true;
        if (last_donation_date) {
            const lastDonation = new Date(last_donation_date);
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            if (lastDonation > threeMonthsAgo) isEligible = false;
        }

        if (!isEligible) return res.json([]);

        const sql = `
          SELECT br.*, u.name AS recipient_name, bt.type AS blood_type FROM BloodRequests AS br
          JOIN Users AS u ON br.recipient_id = u.user_id
          JOIN BloodTypes AS bt ON br.blood_type_id = bt.blood_type_id
          WHERE br.city = ? AND br.blood_type_id = ? AND br.status = 'active' AND br.recipient_id != ?
          ORDER BY br.date_requested DESC
        `;
        const [availableRequests] = await pool.query(sql, [
            city,
            blood_type_id,
            donor_id,
        ]);
        res.json(availableRequests);
    } catch (err) {
        console.error("Error fetching available requests:", err);
        res
            .status(500)
            .json({ message: "Server error fetching available requests" });
    }
});

// POST Accept Request (Protected, Donor Action)
app.post(
    "/api/requests/:requestId/accept",
    authMiddleware,
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const donor_id = req.user.id;
            const request_id = req.params.requestId;

            const [requestRows] = await connection.query(
                "SELECT status, recipient_id FROM BloodRequests WHERE request_id = ?",
                [request_id]
            );
            if (!requestRows[0] || requestRows[0].status !== "active") {
                await connection.rollback();
                connection.release();
                return res
                    .status(400)
                    .json({ message: "Request is no longer active or does not exist." });
            }
            const recipient_id = requestRows[0].recipient_id; // Get recipient ID

            await connection.query(
                "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                ["on_hold", request_id]
            );
            const notificationSql = `
            INSERT INTO RequestNotifications (request_id, donor_id, status) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE status = ?
        `;
            await connection.query(notificationSql, [
                request_id,
                donor_id,
                "accepted",
                "accepted",
            ]);

            // --- Optional: Notify Recipient ---
            try {
                const [recipientData] = await connection.query(
                    "SELECT email, name FROM Users WHERE user_id = ?",
                    [recipient_id]
                );
                const [donorData] = await connection.query(
                    "SELECT name, contact_phone FROM Users WHERE user_id = ?",
                    [donor_id]
                );
                if (recipientData.length > 0 && donorData.length > 0) {
                    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
                    const emailMessage = {
                        to: recipientData[0].email,
                        from: process.env.SENDGRID_FROM_EMAIL,
                        subject: "A Donor Has Accepted Your Blood Request!",
                        html: `<p>Hi ${recipientData[0].name},</p><p>Good news! Donor ${donorData[0].name
                            } has accepted your blood request. You can contact them at: ${donorData[0].contact_phone || "Not Provided"
                            }. Please coordinate the donation.</p>`,
                    };
                    sgMail
                        .send(emailMessage)
                        .catch((err) =>
                            console.error("Error notifying recipient:", err.toString())
                        );
                }
            } catch (notifyError) {
                console.error("Failed to send recipient notification:", notifyError);
            }
            // --- End Notify Recipient ---

            await connection.commit();
            connection.release();
            res.json({
                message: "Request accepted successfully! Recipient has been notified.",
            }); // Updated message
        } catch (err) {
            await connection.rollback();
            connection.release();
            console.error("Error accepting request:", err);
            res.status(500).json({ message: "Server error while accepting request" });
        }
    }
);

// POST Cancel Own Acceptance (Protected, Donor Action)
app.post(
    "/api/requests/:requestId/cancel-acceptance",
    authMiddleware,
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const donor_id = req.user.id;
            const request_id = req.params.requestId;

            const [notificationRows] = await connection.query(
                "SELECT rn.status AS notification_status, br.status AS request_status, br.recipient_id FROM RequestNotifications rn JOIN BloodRequests br ON rn.request_id = br.request_id WHERE rn.request_id = ? AND rn.donor_id = ?",
                [request_id, donor_id]
            );
            if (
                !notificationRows[0] ||
                notificationRows[0].notification_status !== "accepted" ||
                notificationRows[0].request_status !== "on_hold"
            ) {
                await connection.rollback();
                connection.release();
                return res
                    .status(400)
                    .json({
                        message:
                            "Cannot cancel: Request not accepted by you or not on hold.",
                    });
            }
            const recipient_id = notificationRows[0].recipient_id;

            await connection.query(
                "UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND donor_id = ?",
                ["cancelled_by_donor", request_id, donor_id]
            );
            await connection.query(
                "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                ["active", request_id]
            );

            // --- Optional: Notify Recipient ---
            try {
                const [recipientData] = await connection.query(
                    "SELECT email, name FROM Users WHERE user_id = ?",
                    [recipient_id]
                );
                const [donorData] = await connection.query(
                    "SELECT name FROM Users WHERE user_id = ?",
                    [donor_id]
                );
                if (recipientData.length > 0 && donorData.length > 0) {
                    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
                    const emailMessage = {
                        to: recipientData[0].email,
                        from: process.env.SENDGRID_FROM_EMAIL,
                        subject: "Donor Cancelled Acceptance",
                        html: `<p>Hi ${recipientData[0].name},</p><p>Donor ${donorData[0].name} is no longer able to fulfill your blood request. The request is now active again for other donors.</p>`,
                    };
                    sgMail
                        .send(emailMessage)
                        .catch((err) =>
                            console.error(
                                "Error notifying recipient of cancellation:",
                                err.toString()
                            )
                        );
                }
            } catch (notifyError) {
                console.error(
                    "Failed to send recipient cancellation notification:",
                    notifyError
                );
            }
            // --- End Notify Recipient ---

            await connection.commit();
            connection.release();
            res.json({
                message:
                    "Acceptance cancelled successfully. The request is active again.",
            });
        } catch (err) {
            await connection.rollback();
            connection.release();
            console.error("Error cancelling acceptance:", err);
            res
                .status(500)
                .json({ message: "Server error while cancelling acceptance" });
        }
    }
);

// POST Cancel Accepted Donor (Protected, Recipient Action)
app.post(
    "/api/requests/:requestId/cancel-donor",
    authMiddleware,
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const recipient_id = req.user.id;
            const request_id = req.params.requestId;

            const [requestRows] = await connection.query(
                "SELECT recipient_id, status FROM BloodRequests WHERE request_id = ?",
                [request_id]
            );
            if (
                !requestRows[0] ||
                requestRows[0].recipient_id !== recipient_id ||
                requestRows[0].status !== "on_hold"
            ) {
                await connection.rollback();
                connection.release();
                return res
                    .status(400)
                    .json({
                        message: "Cannot cancel donor: Request not yours or not on hold.",
                    });
            }

            // Find donor and update notification
            const [donorNotifications] = await connection.query(
                "SELECT donor_id FROM RequestNotifications WHERE request_id = ? AND status = ?",
                [request_id, "accepted"]
            );
            const donor_id =
                donorNotifications.length > 0 ? donorNotifications[0].donor_id : null;

            const [donorUpdateResult] = await connection.query(
                "UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND status = ?",
                ["cancelled_by_recipient", request_id, "accepted"]
            );
            if (donorUpdateResult.affectedRows === 0)
                console.warn(
                    `No accepted donor found for request ${request_id} during cancellation by recipient ${recipient_id}`
                );

            await connection.query(
                "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                ["active", request_id]
            );

            // --- Optional: Notify Cancelled Donor ---
            if (donor_id) {
                try {
                    const [donorData] = await connection.query(
                        "SELECT email, name FROM Users WHERE user_id = ?",
                        [donor_id]
                    );
                    const [recipientData] = await connection.query(
                        "SELECT name FROM Users WHERE user_id = ?",
                        [recipient_id]
                    );
                    if (donorData.length > 0 && recipientData.length > 0) {
                        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
                        const emailMessage = {
                            to: donorData[0].email,
                            from: process.env.SENDGRID_FROM_EMAIL,
                            subject: "Blood Donation No Longer Required",
                            html: `<p>Hi ${donorData[0].name},</p><p>Thank you for offering to help ${recipientData[0].name}. Your assistance is no longer required for this specific request. The request has been made available to other donors again.</p>`,
                        };
                        sgMail
                            .send(emailMessage)
                            .catch((err) =>
                                console.error(
                                    "Error notifying cancelled donor:",
                                    err.toString()
                                )
                            );
                    }
                } catch (notifyError) {
                    console.error(
                        "Failed to send cancelled donor notification:",
                        notifyError
                    );
                }
            }
            // --- End Notify Cancelled Donor ---

            await connection.commit();
            connection.release();
            res.json({
                message: "Donor cancelled successfully. The request is active again.",
            });
        } catch (err) {
            await connection.rollback();
            connection.release();
            console.error("Error cancelling donor:", err);
            res.status(500).json({ message: "Server error while cancelling donor" });
        }
    }
);

// POST Mark Request Fulfilled (Protected, Recipient Action)
app.post(
    "/api/requests/:requestId/fulfill",
    authMiddleware,
    async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const recipient_id = req.user.id;
            const request_id = req.params.requestId;

            const [requestRows] = await connection.query(
                "SELECT recipient_id, status FROM BloodRequests WHERE request_id = ?",
                [request_id]
            );
            if (
                !requestRows[0] ||
                requestRows[0].recipient_id !== recipient_id ||
                requestRows[0].status !== "on_hold"
            ) {
                await connection.rollback();
                connection.release();
                return res
                    .status(400)
                    .json({
                        message: "Cannot fulfill: Request not yours or not on hold.",
                    });
            }

            const [notificationRows] = await connection.query(
                "SELECT donor_id FROM RequestNotifications WHERE request_id = ? AND status = ?",
                [request_id, "accepted"]
            );
            if (!notificationRows[0]) {
                await connection.rollback();
                connection.release();
                return res
                    .status(404)
                    .json({ message: "No accepted donor found for this request." });
            }
            const donor_id = notificationRows[0].donor_id;

            await connection.query(
                "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                ["fulfilled", request_id]
            );
            await connection.query(
                "UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND donor_id = ?",
                ["fulfilled", request_id, donor_id]
            );

            const donation_date = new Date();
            await connection.query(
                "INSERT INTO Donations (donor_id, recipient_id, request_id, donation_date) VALUES (?, ?, ?, ?)",
                [donor_id, recipient_id, request_id, donation_date]
            );
            await connection.query(
                "UPDATE Users SET last_donation_date = ? WHERE user_id = ?",
                [donation_date, donor_id]
            );

            await connection.commit();
            connection.release();
            res.json({ message: "Request marked as fulfilled successfully!" });
        } catch (err) {
            await connection.rollback();
            connection.release();
            console.error("Error fulfilling request:", err);
            res
                .status(500)
                .json({ message: "Server error while fulfilling request" });
        }
    }
);

// GET Donor's Donation History (Protected)
app.get("/api/donations/myhistory", authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id;
        const sql = `
            SELECT d.donation_id, d.donation_date, u_recipient.name AS recipient_name,
                   br.city AS request_city, bt.type AS blood_type_donated
            FROM Donations AS d
            JOIN Users AS u_recipient ON d.recipient_id = u_recipient.user_id
            LEFT JOIN BloodRequests AS br ON d.request_id = br.request_id
            LEFT JOIN BloodTypes AS bt ON br.blood_type_id = bt.blood_type_id
            WHERE d.donor_id = ? ORDER BY d.donation_date DESC
        `;
        const [history] = await pool.query(sql, [donor_id]);
        res.json(history);
    } catch (err) {
        console.error("Error fetching donation history:", err);
        res.status(500).json({ message: "Server error fetching donation history" });
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});

// --- NEW: PROTECTED API ENDPOINT TO GET A USER'S OWN REQUESTS ---
app.get("/api/requests/myrequests", authMiddleware, async (req, res) => {
    try {
        const recipient_id = req.user.id; // Get user ID from their token

        const sql = `
      SELECT br.*, bt.type AS blood_type
      FROM BloodRequests AS br
      JOIN BloodTypes AS bt ON br.blood_type_id = bt.blood_type_id
      WHERE br.recipient_id = ?
      ORDER BY br.date_requested DESC
    `;

        const [requests] = await pool.query(sql, [recipient_id]);

        res.json(requests); // Send the list of requests
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error fetching requests" });
    }
});

// --- UPDATE: PROTECTED API ENDPOINT TO FIND MATCHING REQUESTS FOR A DONOR ---
app.get("/api/requests/available", authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id;

        // 1. Get the donor's city, blood type, AND last donation date
        const [userRows] = await pool.query(
            "SELECT city, blood_type_id, last_donation_date FROM Users WHERE user_id = ?", // <-- Added last_donation_date
            [donor_id]
        );

        if (!userRows[0]) {
            return res.status(404).json({ message: "Donor profile not found" });
        }

        const { city, blood_type_id, last_donation_date } = userRows[0]; // <-- Get the date

        // --- ADD ELIGIBILITY CHECK ---
        let isEligible = true;
        if (last_donation_date) {
            const lastDonation = new Date(last_donation_date);
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3); // Calculate 3 months ago

            if (lastDonation > threeMonthsAgo) {
                isEligible = false; // Donor donated too recently
            }
        }

        if (!isEligible) {
            // If not eligible, return an empty array immediately
            return res.json([]);
        }
        // -----------------------------

        // 2. Now, find matching active requests (only if eligible)
        const sql = `
            SELECT br.*, u.name AS recipient_name, bt.type AS blood_type
            FROM BloodRequests AS br
            JOIN Users AS u ON br.recipient_id = u.user_id
            JOIN BloodTypes AS bt ON br.blood_type_id = bt.blood_type_id
            WHERE br.city = ?
              AND br.blood_type_id = ?
              AND br.status = 'active'
              AND br.recipient_id != ? 
            ORDER BY br.date_requested DESC
        `;
        const [availableRequests] = await pool.query(sql, [
            city,
            blood_type_id,
            donor_id,
        ]);

        res.json(availableRequests);
    } catch (err) {
        console.error("Error fetching available requests:", err);
        res
            .status(500)
            .json({ message: "Server error fetching available requests" });
    }
});

// --- NEW: PROTECTED API ENDPOINT FOR A DONOR TO ACCEPT A REQUEST ---
app.post(
    "/api/requests/:requestId/accept",
    authMiddleware,
    async (req, res) => {
        try {
            const donor_id = req.user.id; // Get donor's ID from token
            const request_id = req.params.requestId; // Get request ID from the URL

            // --- Transaction Start ---
            // We use a transaction to make sure BOTH updates succeed or fail together.
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // 1. Check if the request is still 'active' (important race condition check)
                const [requestRows] = await connection.query(
                    "SELECT status FROM BloodRequests WHERE request_id = ?",
                    [request_id]
                );

                if (!requestRows[0] || requestRows[0].status !== "active") {
                    await connection.rollback(); // Undo transaction
                    connection.release();
                    return res
                        .status(400)
                        .json({
                            message: "Request is no longer active or does not exist.",
                        });
                }

                // 2. Update the BloodRequest status to 'on_hold'
                await connection.query(
                    "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                    ["on_hold", request_id]
                );

                // 3. Create or Update the RequestNotification for this donor/request
                // We use INSERT ... ON DUPLICATE KEY UPDATE in case a notification record
                // wasn't pre-created (though our current logic does create them).
                // This makes it more robust.
                const notificationSql = `
        INSERT INTO RequestNotifications (request_id, donor_id, status) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE status = ?
      `;
                await connection.query(notificationSql, [
                    request_id,
                    donor_id,
                    "accepted",
                    "accepted",
                ]);

                // --- (Optional but Recommended) ---
                // Here you would add code to:
                // a) Get the recipient's email/phone from the BloodRequest's recipient_id
                // b) Use SendGrid/Twilio to notify the RECIPIENT that a donor has accepted.
                // ------------------------------------

                // If all queries worked, commit the transaction
                await connection.commit();
                connection.release();

                res.json({
                    message:
                        "Request accepted successfully! Please contact the recipient.",
                });
            } catch (innerErr) {
                // If any error occurred inside the transaction, roll back
                await connection.rollback();
                connection.release();
                throw innerErr; // Re-throw the error to be caught by the outer catch
            }
            // --- Transaction End ---
        } catch (err) {
            console.error("Error accepting request:", err);
            res.status(500).json({ message: "Server error while accepting request" });
        }
    }
);

// --- NEW: PROTECTED API ENDPOINT FOR DONOR TO CANCEL THEIR ACCEPTANCE ---
app.post(
    "/api/requests/:requestId/cancel-acceptance",
    authMiddleware,
    async (req, res) => {
        try {
            const donor_id = req.user.id; // Get donor's ID
            const request_id = req.params.requestId;

            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // 1. Verify this donor actually accepted this request and it's 'on_hold'
                const [notificationRows] = await connection.query(
                    "SELECT rn.status AS notification_status, br.status AS request_status FROM RequestNotifications rn JOIN BloodRequests br ON rn.request_id = br.request_id WHERE rn.request_id = ? AND rn.donor_id = ?",
                    [request_id, donor_id]
                );

                if (
                    !notificationRows[0] ||
                    notificationRows[0].notification_status !== "accepted" ||
                    notificationRows[0].request_status !== "on_hold"
                ) {
                    await connection.rollback();
                    connection.release();
                    return res
                        .status(400)
                        .json({
                            message:
                                "Cannot cancel: Request not accepted by you or not on hold.",
                        });
                }

                // 2. Update RequestNotification status
                await connection.query(
                    "UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND donor_id = ?",
                    ["cancelled_by_donor", request_id, donor_id]
                );

                // 3. Update BloodRequest status back to 'active'
                await connection.query(
                    "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                    ["active", request_id]
                );

                // (Optional: Notify recipient that donor cancelled)

                await connection.commit();
                connection.release();
                res.json({
                    message:
                        "Acceptance cancelled successfully. The request is active again.",
                });
            } catch (innerErr) {
                await connection.rollback();
                connection.release();
                throw innerErr;
            }
        } catch (err) {
            console.error("Error cancelling acceptance:", err);
            res
                .status(500)
                .json({ message: "Server error while cancelling acceptance" });
        }
    }
);

// --- NEW: PROTECTED API ENDPOINT FOR RECIPIENT TO CANCEL AN ACCEPTED DONOR ---
app.post(
    "/api/requests/:requestId/cancel-donor",
    authMiddleware,
    async (req, res) => {
        try {
            const recipient_id = req.user.id; // Get recipient's ID
            const request_id = req.params.requestId;

            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // 1. Verify this recipient owns the request and it's 'on_hold'
                const [requestRows] = await connection.query(
                    "SELECT recipient_id, status FROM BloodRequests WHERE request_id = ?",
                    [request_id]
                );

                if (
                    !requestRows[0] ||
                    requestRows[0].recipient_id !== recipient_id ||
                    requestRows[0].status !== "on_hold"
                ) {
                    await connection.rollback();
                    connection.release();
                    return res
                        .status(400)
                        .json({
                            message: "Cannot cancel donor: Request not yours or not on hold.",
                        });
                }

                // 2. Find the donor who accepted and update their notification status
                // Note: In a robust system, you might have multiple 'accepted' initially,
                // but our logic only allows one at a time to reach 'on_hold'.
                const [donorUpdateResult] = await connection.query(
                    "UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND status = ?",
                    ["cancelled_by_recipient", request_id, "accepted"]
                );

                // Check if any donor notification was actually updated
                if (donorUpdateResult.affectedRows === 0) {
                    // This might happen if something went wrong, handle gracefully
                    console.warn(
                        `No accepted donor found for request ${request_id} during cancellation by recipient ${recipient_id}`
                    );
                }

                // 3. Update BloodRequest status back to 'active'
                await connection.query(
                    "UPDATE BloodRequests SET status = ? WHERE request_id = ?",
                    ["active", request_id]
                );

                // (Optional: Notify the cancelled donor)

                await connection.commit();
                connection.release();
                res.json({
                    message: "Donor cancelled successfully. The request is active again.",
                });
            } catch (innerErr) {
                await connection.rollback();
                connection.release();
                throw innerErr;
            }
        } catch (err) {
            console.error("Error cancelling donor:", err);
            res.status(500).json({ message: "Server error while cancelling donor" });
        }
    }
);

// --- NEW: PROTECTED API ENDPOINT TO GET DONOR'S DONATION HISTORY ---
app.get("/api/donations/myhistory", authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id; // Get the logged-in user's ID

        const sql = `
            SELECT 
                d.donation_id, 
                d.donation_date, 
                u_recipient.name AS recipient_name, 
                br.city AS request_city,
                bt.type AS blood_type_donated
            FROM Donations AS d
            JOIN Users AS u_recipient ON d.recipient_id = u_recipient.user_id
            LEFT JOIN BloodRequests AS br ON d.request_id = br.request_id 
            LEFT JOIN BloodTypes AS bt ON br.blood_type_id = bt.blood_type_id 
            WHERE d.donor_id = ?
            ORDER BY d.donation_date DESC
        `;
        // We use LEFT JOINs in case the original BloodRequest or its BloodType was deleted
        // And we join Users again to get the recipient's name

        const [history] = await pool.query(sql, [donor_id]);

        res.json(history);
    } catch (err) {
        console.error("Error fetching donation history:", err);
        res.status(500).json({ message: "Server error fetching donation history" });
    }
});
