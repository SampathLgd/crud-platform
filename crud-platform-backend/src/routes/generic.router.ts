// --- FIX: Import types and values correctly ---
import express = require('express');
import type { Knex } from 'knex'; // Import *only* the type for Knex
const { Router } = require('express'); // Import the Router *value*
const { protect } = require('../middleware/auth.middleware');
// --- (No more duplicate imports) ---

// --- Define Types (again, for clarity in this file) ---
interface ModelDefinition {
  name: string;
  fields: { name: string; type: string }[];
  rbac: { [role: string]: string[] };
  ownerField?: string;
}
interface AuthRequest extends express.Request { // Use express.Request
  user?: { id: number; role: string };
}
// -------------------------------------------------------

/**
 * Creates a generic RBAC middleware for a specific model and operation.
 */
const createRbacMiddleware = (model: ModelDefinition, operation: 'create' | 'read' | 'update' | 'delete') => {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const role = req.user?.role;
    if (!role) return res.status(401).send('Not authenticated');

    const permissions = model.rbac[role] || [];

    // Check if user's role has permission
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
exports.createCrudRouter = (model: ModelDefinition, knex: Knex) => { // <-- Use Knex type
  const router = Router();
  const tableName = model.name.toLowerCase(); // <-- BUG FIX: Use lowercase name
  
  // Apply the 'protect' middleware to ALL routes for this model
  router.use(protect);

  // --- 1. Create (POST /api/<modelName>) ---
  router.post(
    '/',
    createRbacMiddleware(model, 'create'),
    async (req: AuthRequest, res: express.Response) => {
      try {
        const data = req.body;

        // If an ownerField is defined, stamp it with the current user's ID
        if (model.ownerField && req.user) {
          data[model.ownerField] = req.user.id;
        }
        
        // TODO: Add validation based on model.fields
        
        const [newItem] = await knex(tableName).insert(data).returning('*'); // Use tableName
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
      const items = await knex(tableName).select('*'); // Use tableName
      res.json(items);
    }
  );

  // --- 3. Read One (GET /api/<modelName>/:id) ---
  router.get(
    '/:id',
    createRbacMiddleware(model, 'read'),
    async (req: express.Request, res: express.Response) => {
      const [item] = await knex(tableName).where('id', req.params.id).select('*'); // Use tableName
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
        const item = await knex(tableName).where('id', req.params.id).first(); // Use tableName
        if (!item) return res.status(404).send('Item not found');

        // RBAC Ownership Check
        if (
          model.ownerField &&
          req.user?.role !== 'Admin' &&
          item[model.ownerField] !== req.user?.id
        ) {
          return res.status(403).send('Forbidden: You do not own this item');
        }

        const [updatedItem] = await knex(tableName) // Use tableName
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
        const item = await knex(tableName).where('id', req.params.id).first(); // Use tableName
        if (!item) return res.status(404).send('Item not found');

        // RBAC Ownership Check (same as update)
        if (
          model.ownerField &&
          req.user?.role !== 'Admin' &&
          item[model.ownerField] !== req.user?.id
        ) {
          return res.status(403).send('Forbidden: You do not own this item');
        }

        await knex(tableName).where('id', req.params.id).del(); // Use tableName
        res.status(204).send(); // 204 No Content
      } catch (error: any) {
        res.status(500).json({ message: 'Error deleting item', error: error.message });
      }
    }
  );

  return router;
};

