import express = require('express');
// (Add these at the top of index.ts, with your other imports)
import fs = require('fs/promises');
import path = require('path');
import dotenv = require('dotenv');
dotenv.config();

// ...rest of your imports

const cors = require('cors');
const database = require('./database'); // <-- IMPORT from new file

// --- IMPORT THE *CLASSES* ---
const SchemaService = require('./services/schema.service');
const RouterService = require('./services/router.service');

const authRoutes = require('./routes/auth.routes');
const { protect, authorize } = require('./middleware/auth.middleware');

// --- Initialization ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- Initialize Services ---
const schemaService = new SchemaService(database); 
const routerService = new RouterService(app, database);

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Static Routes ---
app.use('/api/auth', authRoutes);

// --- Core "Publish" Endpoint ---
// This is the static endpoint the Admin UI calls
interface AuthRequest extends express.Request { // Define AuthRequest for this file
  user?: { id: number; role: string };
}

app.post(
  '/api/models/publish',
  protect, // User must be logged in
  authorize('Admin'), // Only Admins can publish models
  async (req: AuthRequest, res: express.Response) => { // <-- Use types
    try {
      const modelDefinition = req.body;
      
      // 1. Publish schema (call on the instance)
      await schemaService.publishModel(modelDefinition);
      
      // 2. Register routes dynamically (call on the instance)
      routerService.registerModelRoutes(modelDefinition);
      
      res.status(201).send({ message: 'Model published successfully' });
    } catch (error: any) {
      console.error('Failed to publish model:', error);
      res.status(500).send({ message: 'Failed to publish model', error: error.message });
    }
  }
);

// This endpoint is for the frontend to get all models
app.get('/api/models', protect, async (req: express.Request, res: express.Response) => {
  try {
    const models = await schemaService.loadModels(); // <-- Call on the instance
    res.json(models.map((m: any) => ({ name: m.name, fields: m.fields }))); // Send light version
  } catch (error: any) {
    console.error('Failed to load models:', error);
    res.status(5.00).send({ message: 'Failed to load models', error: error.message });
  }
});
// (This goes in index.ts, right after your app.get('/api/models', ...) route)

// (This REPLACES the old app.delete in index.ts)

app.delete(
  '/api/models/:modelName',
  protect,
  authorize('Admin'),
  async (req: AuthRequest, res: express.Response) => {
    const { modelName } = req.params;

    // 1. Validate modelName
    if (!/^[a-zA-Z0-9_]+$/.test(modelName)) {
      return res.status(400).json({ message: 'Invalid model name format.' });
    }

    // --- THIS IS THE CORRECTED LOGIC ---

    // Define the file path for the .json metadata file
    // (schema.service.ts is in 'services' subdir, so it uses '..')
    // (index.ts is in the root 'dist' dir, so this path is correct)
    const MODELS_DIR = path.join(__dirname, 'models'); 
    const filePath = path.join(MODELS_DIR, `${modelName}.json`);
    
    // Define table name (it's lowercased in your schema.service)
    const tableName = modelName.toLowerCase();

    try {
      // 1. Drop the dynamic data table from the database
      const dropTableQuery = `DROP TABLE IF EXISTS "${tableName}";`;
      await database.raw(dropTableQuery);

      // 2. Delete the metadata .json file from the filesystem
      try {
        await fs.unlink(filePath);
      } catch (fileError: any) {
        // If the file doesn't exist (ENOENT), we don't care.
        // The main goal (dropping the table) succeeded.
        if (fileError.code !== 'ENOENT') {
          // If it's another error (e.g., permissions), log it but
          // still count the operation as a success.
          console.warn(`Dropped table '${tableName}' but failed to delete metadata file: ${fileError.message}`);
        }
      }

      // 3. If successful, send 200 OK
      res.status(200).json({ message: `Model '${modelName}' and all its data deleted successfully.` });

    } catch (error: any) {
      // 4. This catches errors from the database.raw() call
      console.error('Error deleting model (database error):', error);
      res.status(500).json({ message: error.message || 'Server error during model deletion.' });
    }
  }
);


// --- Server Start ---
// (Your startServer function follows...)

// --- Server Start ---
const startServer = async () => {
  try {
    // Test the database connection
    await database.raw('SELECT 1');
    console.log('Database connected successfully.');

    // --- Dynamic Route Loading on Boot ---
    console.log('Loading existing models...');
    const models = await schemaService.loadModels();
    
    for (const model of models) {
      // --- FIX: Check/Create table, THEN register routes ---
      console.log(`Verifying model: ${model.name}`);
      await schemaService.checkAndCreateTable(model); // <-- THIS IS THE FIX
      routerService.registerModelRoutes(model);
    }
    
    console.log(`Loaded ${models.length} models.`);
    
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1); // Exit on failed start
  }
};

startServer();


