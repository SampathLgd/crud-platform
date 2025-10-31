const { Router } = require('express');
const { register, login, forgotPassword, verifyResetToken, resetPassword } = require('../controllers/auth.controller'); // <-- ADD new functions

const router = Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// --- (NEW) ---

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// GET /api/auth/reset-password/:token (To check if token is valid on page load)
router.get('/reset-password/:token', verifyResetToken);

// POST /api/auth/reset-password/:token (To submit the new password)
router.post('/reset-password/:token', resetPassword);

module.exports = router;