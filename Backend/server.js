const sgMail = require('@sendgrid/mail');
//sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const authMiddleware = require('./authMiddleware');
require("dotenv").config(); 
console.log("SENDGRID_API_KEY loaded:", process.env.SENDGRID_API_KEY);
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise"); // Use the 'promise' version
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const port = 3001; // Port for your backend

// --- Middlewares ---
app.use(cors()); // CRITICAL: This allows your frontend to make requests
app.use(express.json()); // Allows server to read JSON

// --- Database Connection Pool ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// --- YOUR FIRST API ENDPOINT ---
app.get("/api/bloodtypes", async (req, res) => {
    try {
        // Get all rows from the BloodTypes table
        const [rows] = await pool.query("SELECT * FROM BloodTypes");
        res.json(rows); // Send the data back as JSON
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching blood types" });
    }
});

// --- NEW: API ENDPOINT FOR USER REGISTRATION ---
app.post("/api/register", async (req, res) => {
    try {
        // 1. Get 'city' from req.body
        const {
            name,
            email,
            password,
            date_of_birth,
            blood_type_id,
            contact_phone,
            city, // <-- ADDED
        } = req.body;

        // 2. Hash the password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Update the SQL query
        const sql = `
      INSERT INTO Users (name, email, password_hash, date_of_birth, blood_type_id, contact_phone, city)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

        // 4. Add 'city' to the query values
        await pool.query(sql, [
            name,
            email,
            passwordHash,
            date_of_birth,
            blood_type_id,
            contact_phone,
            city, // <-- ADDED
        ]);

        res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        console.error(err);
        // Check for duplicate email error
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "Email already exists" });
        }
        res.status(500).json({ message: "Error registering user" });
    }
});

// --- NEW: API ENDPOINT FOR USER LOGIN ---
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Find the user by email
        const [rows] = await pool.query("SELECT * FROM Users WHERE email = ?", [
            email,
        ]);
        const user = rows[0];

        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // 2. Compare the password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // 3. Create a login token (JWT)
        const payload = {
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
            },
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: "3h" } // Token lasts for 3 hours
        );

        // 4. Send the token back to the frontend
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// --- NEW: PROTECTED API ENDPOINT FOR USER PROFILE ---
// We add 'authMiddleware' as a second argument.
// This function will run *before* the async (req, res) function.

app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
        // req.user was added by the authMiddleware
        const userId = req.user.id;

        // Fetch user data from DB, but *without* the password hash
        const [rows] = await pool.query('SELECT user_id, name, email, date_of_birth, contact_phone FROM Users WHERE user_id = ?', [userId]);

        if (!rows[0]) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(rows[0]); // Send the user's profile data

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- UPDATE: PROTECTED API ENDPOINT TO CREATE A BLOOD REQUEST ---
app.post("/api/requests", authMiddleware, async (req, res) => {
    const connection = await pool.getConnection(); // Use connection for transaction
    try {
        await connection.beginTransaction(); // Start transaction

        const { blood_type_id, reason, city } = req.body;
        const recipient_id = req.user.id;
        const date_requested = new Date();
        const status = "active";

        // 1. Insert the request (inside transaction)
        const insertSql = `
          INSERT INTO BloodRequests 
            (recipient_id, blood_type_id, city, reason, date_requested, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [insertResult] = await connection.query(insertSql, [
            recipient_id, blood_type_id, city, reason, date_requested, status
        ]);
        const newRequestId = insertResult.insertId; // Get the ID of the new request

        // --- ADD NOTIFICATION LOGIC ---
        // 2. Find eligible donors (inside transaction)
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const findDonorsSql = `
            SELECT user_id, email, name 
            FROM Users 
            WHERE city = ? 
              AND blood_type_id = ? 
              AND user_id != ? 
              AND (last_donation_date IS NULL OR last_donation_date <= ?)
        `;
        const [eligibleDonors] = await connection.query(findDonorsSql, [
            city, blood_type_id, recipient_id, threeMonthsAgo
        ]);

        // 3. Prepare and Send Emails (can be outside transaction, but do after finding donors)
        if (eligibleDonors.length > 0) {
            console.log(`Found ${eligibleDonors.length} eligible donors. Preparing emails...`);

            // Get recipient name and blood type for email content
            const [recipientData] = await connection.query('SELECT name FROM Users WHERE user_id = ?', [recipient_id]);
            const recipientName = recipientData[0]?.name || 'Someone';
            const [bloodTypeData] = await connection.query('SELECT type FROM BloodTypes WHERE blood_type_id = ?', [blood_type_id]);
            const bloodTypeName = bloodTypeData[0]?.type || 'Unknown';

            sgMail.setApiKey(process.env.SENDGRID_API_KEY);

            for (const donor of eligibleDonors) {
                const emailMessage = {
                    to: donor.email,
                    from: process.env.SENDGRID_FROM_EMAIL, // Use your verified sender
                    subject: `Urgent Blood Request: ${bloodTypeName} needed in ${city}`,
                    html: `
                        <p>Hi ${donor.name},</p>
                        <p>${recipientName} urgently needs <strong>${bloodTypeName}</strong> blood in <strong>${city}</strong>.</p>
                        <p>Reason: ${reason || 'Not specified'}</p>
                        <p>If you are available and eligible to donate, please log in to your account on the Blood Donor Connector platform to view and accept the request.</p>
                        <p>Thank you for your potential help!</p>
                    `,
                };

                // Send the email (fire and forget - don't wait for all)
                sgMail.send(emailMessage)
                    .then(() => console.log('Email sent to ' + donor.email))
                    .catch((error) => console.error('SendGrid Error for ' + donor.email + ':', error.toString()));

                // ALSO: Create the notification record in the DB (inside transaction)
                const notificationSql = `
                    INSERT INTO RequestNotifications (request_id, donor_id, status) 
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE status = ? 
                 `;
                // Set initial status to 'sent'
                await connection.query(notificationSql, [newRequestId, donor.user_id, 'sent', 'sent']);
            }
        } else {
            console.log("No eligible donors found for this request.");
        }
        // --- END NOTIFICATION LOGIC ---

        await connection.commit(); // Commit transaction if all good
        connection.release();
        res.status(201).json({ message: 'Blood request created and notifications sent (if eligible donors found)!' });

    } catch (err) {
        await connection.rollback(); // Rollback on any error
        connection.release();
        console.error('Error creating request or sending notifications:', err);
        res.status(500).json({ message: 'Server error while creating request' });
    }
});


// --- NEW: PROTECTED API ENDPOINT FOR RECIPIENT TO MARK REQUEST AS FULFILLED ---
app.post('/api/requests/:requestId/fulfill', authMiddleware, async (req, res) => {
    try {
        const recipient_id = req.user.id; // Recipient's ID from token
        const request_id = req.params.requestId;

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Verify recipient owns the request and it's 'on_hold'
            const [requestRows] = await connection.query(
                'SELECT recipient_id, status FROM BloodRequests WHERE request_id = ?',
                [request_id]
            );

            if (!requestRows[0] || requestRows[0].recipient_id !== recipient_id || requestRows[0].status !== 'on_hold') {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Cannot fulfill: Request not yours or not on hold.' });
            }

            // 2. Find the donor who accepted this request
            const [notificationRows] = await connection.query(
                'SELECT donor_id FROM RequestNotifications WHERE request_id = ? AND status = ?',
                [request_id, 'accepted']
            );

            if (!notificationRows[0]) {
                // Should not happen if request is 'on_hold' due to our logic, but good check
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: 'No accepted donor found for this request.' });
            }
            const donor_id = notificationRows[0].donor_id;

            // 3. Update BloodRequest status to 'fulfilled'
            await connection.query(
                'UPDATE BloodRequests SET status = ? WHERE request_id = ?',
                ['fulfilled', request_id]
            );

            // 4. Update the accepted Donor's notification status to 'fulfilled'
            await connection.query(
                'UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND donor_id = ?',
                ['fulfilled', request_id, donor_id]
            );

            // 5. Create a record in the Donations table
            const donation_date = new Date(); // Record donation date as today
            await connection.query(
                'INSERT INTO Donations (donor_id, recipient_id, request_id, donation_date) VALUES (?, ?, ?, ?)',
                [donor_id, recipient_id, request_id, donation_date]
            );

            // 6. Update the donor's last_donation_date in the Users table
            await connection.query(
                'UPDATE Users SET last_donation_date = ? WHERE user_id = ?',
                [donation_date, donor_id]
            );

            await connection.commit();
            connection.release();
            res.json({ message: 'Request marked as fulfilled successfully!' });

        } catch (innerErr) {
            await connection.rollback();
            connection.release();
            throw innerErr;
        }

    } catch (err) {
        console.error('Error fulfilling request:', err);
        res.status(500).json({ message: 'Server error while fulfilling request' });
    }
});


// --- Start the Server ---
app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});

// --- NEW: PROTECTED API ENDPOINT TO GET A USER'S OWN REQUESTS ---
app.get('/api/requests/myrequests', authMiddleware, async (req, res) => {
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
        res.status(500).json({ message: 'Server error fetching requests' });
    }
});


// --- UPDATE: PROTECTED API ENDPOINT TO FIND MATCHING REQUESTS FOR A DONOR ---
app.get('/api/requests/available', authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id;

        // 1. Get the donor's city, blood type, AND last donation date
        const [userRows] = await pool.query(
            'SELECT city, blood_type_id, last_donation_date FROM Users WHERE user_id = ?', // <-- Added last_donation_date
            [donor_id]
        );

        if (!userRows[0]) {
            return res.status(404).json({ message: 'Donor profile not found' });
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
        const [availableRequests] = await pool.query(sql, [city, blood_type_id, donor_id]);

        res.json(availableRequests);

    } catch (err) {
        console.error('Error fetching available requests:', err);
        res.status(500).json({ message: 'Server error fetching available requests' });
    }
});

// --- NEW: PROTECTED API ENDPOINT FOR A DONOR TO ACCEPT A REQUEST ---
app.post('/api/requests/:requestId/accept', authMiddleware, async (req, res) => {
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
                'SELECT status FROM BloodRequests WHERE request_id = ?',
                [request_id]
            );

            if (!requestRows[0] || requestRows[0].status !== 'active') {
                await connection.rollback(); // Undo transaction
                connection.release();
                return res.status(400).json({ message: 'Request is no longer active or does not exist.' });
            }

            // 2. Update the BloodRequest status to 'on_hold'
            await connection.query(
                'UPDATE BloodRequests SET status = ? WHERE request_id = ?',
                ['on_hold', request_id]
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
            await connection.query(notificationSql, [request_id, donor_id, 'accepted', 'accepted']);

            // --- (Optional but Recommended) ---
            // Here you would add code to:
            // a) Get the recipient's email/phone from the BloodRequest's recipient_id
            // b) Use SendGrid/Twilio to notify the RECIPIENT that a donor has accepted.
            // ------------------------------------

            // If all queries worked, commit the transaction
            await connection.commit();
            connection.release();

            res.json({ message: 'Request accepted successfully! Please contact the recipient.' });

        } catch (innerErr) {
            // If any error occurred inside the transaction, roll back
            await connection.rollback();
            connection.release();
            throw innerErr; // Re-throw the error to be caught by the outer catch
        }
        // --- Transaction End ---

    } catch (err) {
        console.error('Error accepting request:', err);
        res.status(500).json({ message: 'Server error while accepting request' });
    }
});


// --- NEW: PROTECTED API ENDPOINT FOR DONOR TO CANCEL THEIR ACCEPTANCE ---
app.post('/api/requests/:requestId/cancel-acceptance', authMiddleware, async (req, res) => {
    try {
        const donor_id = req.user.id; // Get donor's ID
        const request_id = req.params.requestId;

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Verify this donor actually accepted this request and it's 'on_hold'
            const [notificationRows] = await connection.query(
                'SELECT rn.status AS notification_status, br.status AS request_status FROM RequestNotifications rn JOIN BloodRequests br ON rn.request_id = br.request_id WHERE rn.request_id = ? AND rn.donor_id = ?',
                [request_id, donor_id]
            );

            if (!notificationRows[0] || notificationRows[0].notification_status !== 'accepted' || notificationRows[0].request_status !== 'on_hold') {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Cannot cancel: Request not accepted by you or not on hold.' });
            }

            // 2. Update RequestNotification status
            await connection.query(
                'UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND donor_id = ?',
                ['cancelled_by_donor', request_id, donor_id]
            );

            // 3. Update BloodRequest status back to 'active'
            await connection.query(
                'UPDATE BloodRequests SET status = ? WHERE request_id = ?',
                ['active', request_id]
            );

            // (Optional: Notify recipient that donor cancelled)

            await connection.commit();
            connection.release();
            res.json({ message: 'Acceptance cancelled successfully. The request is active again.' });

        } catch (innerErr) {
            await connection.rollback();
            connection.release();
            throw innerErr;
        }

    } catch (err) {
        console.error('Error cancelling acceptance:', err);
        res.status(500).json({ message: 'Server error while cancelling acceptance' });
    }
});


// --- NEW: PROTECTED API ENDPOINT FOR RECIPIENT TO CANCEL AN ACCEPTED DONOR ---
app.post('/api/requests/:requestId/cancel-donor', authMiddleware, async (req, res) => {
    try {
        const recipient_id = req.user.id; // Get recipient's ID
        const request_id = req.params.requestId;

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // 1. Verify this recipient owns the request and it's 'on_hold'
            const [requestRows] = await connection.query(
                'SELECT recipient_id, status FROM BloodRequests WHERE request_id = ?',
                [request_id]
            );

            if (!requestRows[0] || requestRows[0].recipient_id !== recipient_id || requestRows[0].status !== 'on_hold') {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Cannot cancel donor: Request not yours or not on hold.' });
            }

            // 2. Find the donor who accepted and update their notification status
            // Note: In a robust system, you might have multiple 'accepted' initially,
            // but our logic only allows one at a time to reach 'on_hold'.
            const [donorUpdateResult] = await connection.query(
                'UPDATE RequestNotifications SET status = ? WHERE request_id = ? AND status = ?',
                ['cancelled_by_recipient', request_id, 'accepted']
            );

            // Check if any donor notification was actually updated
            if (donorUpdateResult.affectedRows === 0) {
                // This might happen if something went wrong, handle gracefully
                console.warn(`No accepted donor found for request ${request_id} during cancellation by recipient ${recipient_id}`);
            }

            // 3. Update BloodRequest status back to 'active'
            await connection.query(
                'UPDATE BloodRequests SET status = ? WHERE request_id = ?',
                ['active', request_id]
            );

            // (Optional: Notify the cancelled donor)

            await connection.commit();
            connection.release();
            res.json({ message: 'Donor cancelled successfully. The request is active again.' });

        } catch (innerErr) {
            await connection.rollback();
            connection.release();
            throw innerErr;
        }

    } catch (err) {
        console.error('Error cancelling donor:', err);
        res.status(500).json({ message: 'Server error while cancelling donor' });
    }
});



// --- NEW: PROTECTED API ENDPOINT TO GET DONOR'S DONATION HISTORY ---
app.get('/api/donations/myhistory', authMiddleware, async (req, res) => {
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
        console.error('Error fetching donation history:', err);
        res.status(500).json({ message: 'Server error fetching donation history' });
    }
});