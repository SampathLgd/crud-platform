const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const pool = require('../db');

// YOUR EXISTING GET ROUTE
router.get('/', authMiddleware, async (req, res) => {
    // ... your code to get all models ...
});

// YOUR EXISTING PUBLISH ROUTE
router.post('/publish', authMiddleware, async (req, res) => {
    // ... your code to create a new model ...
});

// --- THIS IS THE NEW CODE YOU MUST ADD ---
router.delete('/:modelName', authMiddleware, async (req, res) => {
    
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden: Only Admins can delete models.' });
    }

    const { modelName } = req.params;

    // Validate modelName to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(modelName)) {
        return res.status(400).json({ message: 'Invalid model name format.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Drop the dynamic data table
        // Use quotes to handle case-sensitivity
        const dropTableQuery = `DROP TABLE IF EXISTS "${modelName}";`;
        await client.query(dropTableQuery);

        // 2. Delete the model from the metadata table (e.g., 'models')
        const deleteMetadataQuery = 'DELETE FROM models WHERE name = $1';
        const result = await client.query(deleteMetadataQuery, [modelName]);

        if (result.rowCount === 0) {
            // This is not a critical error, maybe the table existed but metadata was gone
            // Still, it's good to commit, but we can warn the console
            console.warn(`No model metadata found for '${modelName}', but table (if existed) was dropped.`);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: `Model '${modelName}' and all its data deleted successfully.` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting model:', error);
        res.status(500).json({ message: error.message || 'Server error during model deletion.' });
    } finally {
        client.release();
    }
});
// -------------------------------------------

module.exports = router;