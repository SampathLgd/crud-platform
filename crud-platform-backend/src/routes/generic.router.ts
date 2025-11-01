// --- FIX: Import types and values correctly ---
import express = require('express');
import type { Knex } from 'knex'; // Import *only* the type for Knex
const { Router } = require('express'); // Import the Router *value*
const { protect } = require('../middleware/auth.middleware');
// --- (No more duplicate imports) ---

// --- Define Types (again, for clarity in this file) ---
interface Field {
  name: string;
  type: string; // 'string', 'number', 'float', 'boolean', 'relation'
  required?: boolean;
}
interface ModelDefinition {
  tableName: string;
  name: string;
  fields: Field[];
  rbac: { [role: string]: string[] };
  ownerField?: string;
}
interface AuthRequest extends express.Request { // Use express.Request
  user?: { id: number; role: string; email: string }; // Added email for audit log
}
// -------------------------------------------------------

// --- NEW: Data Validation Function ---
/**
 * Validates incoming data against the model definition.
 * Returns an error message string if invalid, or null if valid.
 */
function validateData(model: ModelDefinition, data: any): string | null {
  for (const field of model.fields) {
    const value = data[field.name];

    // 1. Check for required fields
    if (field.required && (value === undefined || value === null || value === "")) {
      // Allow 'false' for required booleans
      if (field.type === 'boolean' && value === false) {
        // This is valid
      } else {
        return `Field "${field.name}" is required.`;
      }
    }

    // 2. Check types (if a value is present)
    if (value !== undefined && value !== null && value !== "") {
      switch (field.type) {
        case 'number':
          if (isNaN(Number(value))) {
            return `Field "${field.name}" must be a valid number.`;
          }
          break;
        case 'float':
          if (isNaN(parseFloat(value))) {
            return `Field "${field.name}" must be a valid float (e.g., 12.34).`;
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            return `Field "${field.name}" must be a boolean (true or false).`;
          }
          break;
        // 'string' and 'relation' (which is just an ID) don't need strict type checks here
      }
    }
  }
  return null; // All good
}
// --- END: Data Validation Function ---

/**
 * Creates a generic RBAC middleware for a specific model and operation.
 */
const createRbacMiddleware = (model: ModelDefinition, operation: 'create' | 'read' | 'update' | 'delete') => {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const role = req.user?.role;
    if (!role) return res.status(401).send('Not authenticated');

    const permissions = model.rbac[role] || [];

    if (permissions.includes(operation) || permissions.includes('all')) {
      return next(); // Allowed!
    }

    return res.status(403).send('Forbidden: Insufficient permissions');
  };
};

/**
 * This is a factory function that creates a new router
 * customized for a specific model definition.
 */
exports.createCrudRouter = (model: ModelDefinition, knex: Knex) => {
  const router = Router();
  // --- BUG FIX: Use tableName from definition if present ---
  const tableName = model.tableName || model.name.toLowerCase();
  
  router.use(protect);

  // --- 1. Create (POST /api/<modelName>) ---
  router.post(
    '/',
    createRbacMiddleware(model, 'create'),
    async (req: AuthRequest, res: express.Response) => {
      try {
        const data = req.body;

        // --- MODIFIED: Validate data ---
        const validationError = validateData(model, data);
        if (validationError) {
          return res.status(400).json({ message: validationError });
        }
        // --- END VALIDATION ---

        if (model.ownerField && req.user) {
          data[model.ownerField] = req.user.id;
        }
        
        const [newItem] = await knex(tableName).insert(data).returning('*');
        res.status(201).json(newItem);
      } catch (error: any) {
        res.status(500).json({ message: 'Error creating item', error: error.message });
      }
    }
  );

  // --- 2. Read All (GET /api/<modelName>) ---
  router.get(
    '/',
    createRbacMiddleware(model, 'read'),
    async (req: express.Request, res: express.Response) => {
      const items = await knex(tableName).select('*');
      res.json(items);
    }
  );

  // --- 3. Read One (GET /api/<modelName>/:id) ---
  router.get(
    '/:id',
    createRbacMiddleware(model, 'read'),
    async (req: express.Request, res: express.Response) => {
      const [item] = await knex(tableName).where('id', req.params.id).select('*');
      if (!item) return res.status(404).send('Item not found');
      res.json(item);
    }
  );

  // --- 4. Update (PUT /api/<modelName>/:id) ---
  router.put(
    '/:id',
    createRbacMiddleware(model, 'update'),
    async (req: AuthRequest, res: express.Response) => {
      try {
        // --- MODIFIED: Validate data ---
        const validationError = validateData(model, req.body);
        if (validationError) {
          return res.status(400).json({ message: validationError });
        }
        // --- END VALIDATION ---

        const item = await knex(tableName).where('id', req.params.id).first();
        if (!item) return res.status(404).send('Item not found');

        if (
          model.ownerField &&
          req.user?.role !== 'Admin' &&
          item[model.ownerField] !== req.user?.id
        ) {
          return res.status(403).send('Forbidden: You do not own this item');
        }

        const [updatedItem] = await knex(tableName)
          .where('id', req.params.id)
          .update(req.body)
          .returning('*');
        res.json(updatedItem);
      } catch (error: any) {
        res.status(500).json({ message: 'Error updating item', error: error.message });
      }
    }
  );

  // --- 5. Delete (DELETE /api/<modelName>/:id) ---
  router.delete(
    '/:id',
    createRbacMiddleware(model, 'delete'),
    async (req: AuthRequest, res: express.Response) => {
      try {
        const item = await knex(tableName).where('id', req.params.id).first();
        if (!item) return res.status(404).send('Item not found');

        if (
          model.ownerField &&
          req.user?.role !== 'Admin' &&
          item[model.ownerField] !== req.user?.id
        ) {
          return res.status(403).send('Forbidden: You do not own this item');
        }

        await knex(tableName).where('id', req.params.id).del();
        res.status(204).send();
      } catch (error: any) {
        res.status(500).json({ message: 'Error deleting item', error: error.message });
      }
    }
  );

  return router;
};