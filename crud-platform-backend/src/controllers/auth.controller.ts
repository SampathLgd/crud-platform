import express = require('express'); // Use this for types
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database'); // <-- IMPORT from database.ts

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY'; // Use environment variable or default

// --- REGISTER ---
exports.register = async (req: express.Request, res: express.Response) => {
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email and password are required.');
    }

    // Basic email format check (optional but recommended)
    if (!/\S+@\S+\.\S+/.test(email)) {
         return res.status(400).send('Invalid email format.');
    }
    // Basic password length check (optional but recommended)
    if (password.length < 6) {
         return res.status(400).send('Password must be at least 6 characters long.');
    }


    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await database('users')
            .insert({
                email,
                password: hashedPassword,
                // Ensure role is valid or default
                role: ['Admin', 'Manager', 'Viewer'].includes(role) ? role : 'Viewer',
            })
            .returning(['id', 'email', 'role']); // Only return necessary fields

        res.status(201).json(newUser); // Send back the created user object (without password)

    } catch (error: any) { // Type error as any to check properties
        console.error("Registration Error:", error);

        // *** NEW: Check for unique constraint violation (PostgreSQL code '23505') ***
        // Ensure your unique constraint in the migration is named 'users_email_unique' or adjust here
        if (error.code === '23505' /* && error.constraint === 'users_email_unique' */) { // Check code, constraint name might vary
             return res.status(409).send('Email already exists.'); // 409 Conflict
        }

        // Generic error for other issues
        res.status(500).send('Error registering user.');
    }
};

// --- LOGIN ---
exports.login = async (req: express.Request, res: express.Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email and password are required.');
    }

    try {
        const user = await database('users').where({ email }).first();
        if (!user) {
            // Keep message generic for security (don't reveal if email exists)
            return res.status(401).send('Invalid credentials.');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
             // Keep message generic
            return res.status(401).send('Invalid credentials.');
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' } // Consider making this configurable
        );

        res.json({
            message: 'Logged in successfully',
            token,
            user: { // Send back basic user info (without password)
                id: user.id,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).send('Error logging in.');
    }
};

