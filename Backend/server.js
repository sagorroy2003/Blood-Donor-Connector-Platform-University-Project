const authMiddleware = require('./authMiddleware');
require("dotenv").config(); // Load variables from .env
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
        const {
            name,
            email,
            password,
            date_of_birth,
            blood_type_id,
            contact_phone,
        } = req.body;

        // 1. Hash the password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 2. Insert user into the database
        const sql = `
      INSERT INTO Users (name, email, password_hash, date_of_birth, blood_type_id, contact_phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        // Note: We are only inserting the main fields for now
        await pool.query(sql, [
            name,
            email,
            passwordHash,
            date_of_birth,
            blood_type_id,
            contact_phone,
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

// --- NEW: PROTECTED API ENDPOINT TO CREATE A BLOOD REQUEST ---
app.post('/api/requests', authMiddleware, async (req, res) => {
    try {
        // Get the data from the form
        const { blood_type_id, reason, location_text, latitude, longitude } = req.body;

        // Get the user's ID from the token
        const recipient_id = req.user.id;

        // Set default values
        const date_requested = new Date(); // Set current date and time
        const status = 'active'; // Set default status to 'active'

        const sql = `
      INSERT INTO BloodRequests 
        (recipient_id, blood_type_id, location_text, latitude, longitude, reason, date_requested, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

        await pool.query(sql, [
            recipient_id,
            blood_type_id,
            location_text,
            latitude,
            longitude,
            reason,
            date_requested,
            status
        ]);

        res.status(201).json({ message: 'Blood request created successfully!' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error while creating request' });
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});
