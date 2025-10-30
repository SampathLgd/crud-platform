// --- FIX: Import types, not values ---
import type { Express } from 'express';
import type { Knex } from 'knex';
// const { Express } = require('express'); // <-- DELETE
// const { Knex } = require('knex'); // <-- DELETE

const { createCrudRouter } = require('../routes/generic.router');

// Define the Model type again (or move to a shared .d.ts file)
interface ModelDefinition {
  name: string;
  fields: { name: string; type: string }[];
  rbac: { [role: string]: string[] };
  ownerField?: string;
}

class RouterService {
  // --- FIX: These types will now be found ---
  private app: Express;
  private knex: Knex;

  // --- FIX: These types will also be found ---
  constructor(app: Express, knex: Knex) {
    this.app = app;
    this.knex = knex;
  }

  /**
   * Dynamically creates and mounts a new set of CRUD API routes
   * onto the main Express app.
   */
  registerModelRoutes(model: ModelDefinition): void {
    const tableName = model.name.toLowerCase();
    console.log(`[RouterService] Registering routes for: /api/${tableName}`);
    
    // 1. Create the new router using our generic factory
    const router = createCrudRouter(model, this.knex);
    
    // 2. Mount the new router on the Express app
    // e.g., app.use('/api/product', productRouter)
    this.app.use(`/api/${tableName}`, router);
  }
}

module.exports = RouterService;

