import express = require('express');
import type { Transporter } from 'nodemailer';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // <-- ADD: For generating random tokens
const nodemailer = require('nodemailer'); // <-- ADD: For sending emails
const database = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SUPER_SECRET_KEY';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5501'; // <-- ADD: URL to your frontend

// --- (NEW) Nodemailer Test Transporter ---
// We'll set this up when the server starts.
// In src/controllers/auth.controller.ts

let transporter: Transporter; // Your variable should already be here

const setupEmail = async () => {
    if (transporter) return; 

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn("--- NODEMAILER WARNING: EMAIL_USER or EMAIL_PASS not set in .env file. ---");
        return;
    }

    try {
        // Configure the transporter for Gmail
        transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER, // Your email from .env
                pass: process.env.EMAIL_PASS, // Your App Password from .env
            },
        });

        await transporter.verify();
        console.log("Nodemailer (Gmail) is configured and ready to send emails.");

    } catch (error) {
         console.error("Failed to configure Nodemailer for Gmail", error);
    }
};

// Call setup on module load
setupEmail();
// --- (END NEW) ---


// --- REGISTER (Existing) ---
exports.register = async (req: express.Request, res: express.Response) => {
    // ... your existing register code ...
    // (No changes needed)
    const { email, password, role } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email and password are required.');
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
         return res.status(400).send('Invalid email format.');
    }
    if (password.length < 6) {
         return res.status(400).send('Password must be at least 6 characters long.');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [newUser] = await database('users')
            .insert({
                email,
                password: hashedPassword,
                role: ['Admin', 'Manager', 'Viewer'].includes(role) ? role : 'Viewer',
            })
            .returning(['id', 'email', 'role']); 
        res.status(201).json(newUser);
    } catch (error: any) {
        console.error("Registration Error:", error);
        if (error.code === '23505') {
             return res.status(409).send('Email already exists.');
        }
        res.status(500).send('Error registering user.');
    }
};

// --- LOGIN (Existing) ---
exports.login = async (req: express.Request, res: express.Response) => {
    // ... your existing login code ...
    // (No changes needed)
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email and password are required.');
    }

    try {
        const user = await database('users').where({ email }).first();
        if (!user) {
            return res.status(401).send('Invalid credentials.');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).send('Invalid credentials.');
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            message: 'Logged in successfully',
            token,
            user: { id: user.id, email: user.email, role: user.role },
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).send('Error logging in.');
    }
};

// --- (NEW) FORGOT PASSWORD ---
exports.forgotPassword = async (req: express.Request, res: express.Response) => {
    const { email } = req.body;

    try {
        const user = await database('users').where({ email }).first();
        
        // IMPORTANT: Always send a 200 OK response.
        // This prevents attackers from guessing which emails are registered.
        if (!user) {
            console.log(`[Forgot Pass] Non-existent user request: ${email}`);
           return res.status(404).send('Email is not registered.');
        }

        // 1. Generate a secure token
        const token = crypto.randomBytes(32).toString('hex');
        
        // 2. Set token and expiry (1 hour from now)
        const expiry = Date.now() + 3600000; // 1 hour in milliseconds

        // 3. Save token to user in database
        await database('users').where({ id: user.id }).update({
            resetToken: token,
            resetTokenExpiry: expiry
        });

        // 4. Create the reset URL (points to your frontend)
        // Ensure your HTML file is being served (e.g., with VS Code Live Server)
        const resetURL = `${FRONTEND_URL}/index.html#reset-password?token=${token}`;
        
        // 5. Send the email
        const mailOptions = {
            from: '"Admin Panel" <noreply@yourdomain.com>',
            to: user.email,
            subject: 'Password Reset Request',
            text: `You requested a password reset. Please click the link to reset your password:\n\n${resetURL}\n\nThis link will expire in 1 hour.`,
            html: `
                <p>You requested a password reset.</p>
                <p>Click this <a href="${resetURL}">link</a> to set a new password.</p>
                <p>This link will expire in 1 hour.</p>
            `
        };
        
        if (transporter) {
            let info = await transporter.sendMail(mailOptions);
            console.log(`[Forgot Pass] Reset email "sent" to ${email}.`);
            // This is the link to the Ethereal test inbox:
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        } else {
             console.error("[Forgot Pass] Nodemailer transporter not set up. Cannot send email.");
        }
        
        res.status(200).send('A password reset link has been sent to your email.');

    } catch (error) {
        console.error("Forgot Password Error:", error);
        // Still send a generic message on failure
        res.status(200).send('An internal server error occurred.');
    }
};

// --- (NEW) VERIFY RESET TOKEN (for the page load) ---
exports.verifyResetToken = async (req: express.Request, res: express.Response) => {
    const { token } = req.params;

    try {
        const user = await database('users')
            .where({ resetToken: token })
            .andWhere('resetTokenExpiry', '>', Date.now()) // Check if token is not expired
            .first();
            
        if (!user) {
            return res.status(400).send('Token is invalid or has expired.');
        }

        // Token is valid
        res.status(200).send('Token is valid.');
    } catch (error) {
        console.error("Verify Token Error:", error);
        res.status(500).send('Error verifying token.');
    }
};

// --- (NEW) RESET PASSWORD (for the form submission) ---
exports.resetPassword = async (req: express.Request, res: express.Response) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).send('Password must be at least 6 characters long.');
    }

    try {
        // 1. Find user by token and check expiry
        const user = await database('users')
            .where({ resetToken: token })
            .andWhere('resetTokenExpiry', '>', Date.now())
            .first();
            
        if (!user) {
            return res.status(400).send('Token is invalid or has expired. Please request a new link.');
        }

        // 2. Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Update the user's password and clear the token
        await database('users').where({ id: user.id }).update({
            password: hashedPassword,
            resetToken: null,       // Invalidate the token
            resetTokenExpiry: null  // Invalidate the token
        });

        res.status(200).send('Password has been reset successfully.');

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).send('Error resetting password.');
    }
};