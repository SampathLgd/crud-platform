// src/index.ts
import express = require('express');
import fs = require('fs/promises');
import path = require('path');
import dotenv = require('dotenv');
dotenv.config(); // Load .env file

const cors = require('cors');
const database = require('./database');

// --- IMPORT THE *CLASSES* ---
const SchemaService = require('./services/schema.service');
const RouterService = require('./services/router.service');

const authRoutes = require('./routes/auth.routes');
const { protect, authorize } = require('./middleware/auth.middleware');

// --- Initialization ---
export const app = express(); // <-- FIX 1: EXPORT THE APP
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
interface AuthRequest extends express.Request {
  user?: { id: number; role: string };
}

app.post(
  '/api/models/publish',
  protect,
  authorize('Admin'),
  async (req: AuthRequest, res: express.Response) => {
    try {
      const modelDefinition = req.body;
      await schemaService.publishModel(modelDefinition);
      // This is the "hot reload"
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
    const models = await schemaService.loadModels();
    // Send a lighter version of models for the list view
    res.json(models.map((m: any) => ({ 
        name: m.name, 
        description: m.description, 
        fields: m.fields 
    })));
  } catch (error: any) {
    console.error('Failed to load models:', error);
    res.status(500).send({ message: 'Failed to load models', error: error.message });
  }
});

app.delete(
  '/api/models/:modelName',
  protect,
  authorize('Admin'),
  async (req: AuthRequest, res: express.Response) => {
    const { modelName } = req.params;

    if (!/^[a-zA-Z0-9_]+$/.test(modelName)) {
      return res.status(400).json({ message: 'Invalid model name format.' });
    }

    const MODELS_DIR = path.join(__dirname, 'models'); 
    const filePath = path.join(MODELS_DIR, `${modelName}.json`);
    
    let tableName = modelName.toLowerCase();
    try {
        // Check for custom table name
        const content = await fs.readFile(filePath, 'utf-8');
        const modelDef = JSON.parse(content);
        if (modelDef.tableName) {
            tableName = modelDef.tableName;
        }
    } catch (e) {
        console.warn(`Could not read model file ${modelName}.json.`);
    }

    try {
      // Drop the table
      await database.raw(`DROP TABLE IF EXISTS "${tableName}";`);

      // Delete the .json file
      try {
        await fs.unlink(filePath);
      } catch (fileError: any) {
        if (fileError.code !== 'ENOENT') {
          console.warn(`Dropped table '${tableName}' but failed to delete file: ${fileError.message}`);
        }
      }
      res.status(200).json({ message: `Model '${modelName}' and all its data deleted successfully.` });

    } catch (error: any) {
      console.error('Error deleting model:', error);
      res.status(500).json({ message: error.message || 'Server error during model deletion.' });
    }
  }
);


// --- Server Start ---
export const startServer = async () => {
  try {
    await database.raw('SELECT 1');
    console.log('Database connected successfully.');

    console.log('Loading existing models...');
    const models = await schemaService.loadModels();
    
    for (const model of models) {
      console.log(`Verifying model: ${model.name}`);
      await schemaService.checkAndCreateTable(model);
      routerService.registerModelRoutes(model);
    }
    
    console.log(`Loaded ${models.length} models.`);
    
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// --- FIX 2: Only start server if run directly ---
if (require.main === module) {
  startServer();
}