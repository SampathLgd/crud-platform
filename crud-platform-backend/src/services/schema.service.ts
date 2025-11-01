const fs = require('fs/promises');
const path = require('path');
// --- FIX: Import types from 'knex' ---
import type { Knex } from 'knex'; 
// const { Knex } = require('knex'); // <-- DELETE this line
// const db = require('../database'); // <-- DELETE this line (causes redeclare error)

// --- Define the Model Structure (from the PDF) ---
// (Interface definitions are fine)
interface Field {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'relation';
  required?: boolean;
  relation?: string; // <-- ADD: For relation fields
}

interface RBACRules {
  [role: string]: ('create' | 'read' | 'update' | 'delete' | 'all')[];
}

interface ModelDefinition {
  name: string;
  fields: Field[];
  rbac: RBACRules;
  ownerField?: string;
}
// --------------------------------------------------

const MODELS_DIR = path.join(__dirname, '..', 'models');

class SchemaService {
  // --- FIX: This type will now be found ---
  private knex: Knex;

  // --- FIX: This type will also be found ---
  constructor(knex: Knex) {
    this.knex = knex;
  }

  /**
   * Writes the model definition to a .json file
   * and creates the corresponding SQL table.
   */
  async publishModel(model: ModelDefinition): Promise<void> {
    // 1. Write the file
    await fs.mkdir(MODELS_DIR, { recursive: true });
    const filePath = path.join(MODELS_DIR, `${model.name}.json`);
    await fs.writeFile(filePath, JSON.stringify(model, null, 2));

    // 2. Create the SQL table
    await this.createTableFromDefinition(model);
  }

  // --- ADD THIS NEW FUNCTION ---
  /**
   * Checks if a table exists for a model, and creates it if it doesn't.
   * This makes the server self-healing on startup.
   */
  async checkAndCreateTable(model: ModelDefinition): Promise<void> {
    const tableName = model.name.toLowerCase();
    const hasTable = await this.knex.schema.hasTable(tableName);

    if (!hasTable) {
      console.log(`Table '${tableName}' not found. Creating it...`);
      await this.createTableFromDefinition(model);
    } else {
      console.log(`Table '${tableName}' already exists.`);
    }
  }
  // --- END OF NEW FUNCTION ---

  /**
   * Dynamically creates a SQL table from a model definition.
   */
  private async createTableFromDefinition(model: ModelDefinition): Promise<void> {
    // Use model.name.toLowerCase() for the table name for consistency
    const tableName = model.name.toLowerCase();

    await this.knex.schema.createTable(tableName, (table: Knex.TableBuilder) => { // <-- FIX: Type 'table'
      table.increments('id').primary();

      // Loop through fields and create columns
      for (const field of model.fields) {
        let column;
        switch (field.type) {
          case 'string':
            column = table.string(field.name);
            break;
          case 'number':
            column = table.integer(field.name); // Using integer for simplicity
            break;
          case 'boolean':
            column = table.boolean(field.name).defaultTo(false);
            break;
          case 'relation':
            column = table.integer(field.name).unsigned();
            if (field.relation) {
                column.references('id').inTable(field.relation.toLowerCase()).onDelete('SET NULL');
            }
            break;
        }
        if (field.required) {
          column.notNullable();
        }
      }

      // Handle the 'ownerField' (from the PDF)
      if (model.ownerField) {
        table.integer(model.ownerField)
          .unsigned()
          .references('id')
          .inTable('users')
          .onDelete('SET NULL'); // Or 'CASCADE'
      }

      table.timestamps(true, true);
    });
  }

  /**
   * Reads all model .json files from the /models directory.
   * This is used on server startup.
   */
  async loadModels(): Promise<ModelDefinition[]> {
    try {
      await fs.mkdir(MODELS_DIR, { recursive: true });
      const files = await fs.readdir(MODELS_DIR);
      const models: ModelDefinition[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(MODELS_DIR, file);
          const content = await fs.readFile(filePath, 'utf-8');
          models.push(JSON.parse(content));
        }
      }
      return models;
    } catch (error) {
      console.error('Error loading models:', error);
      return [];
    }
  }
}

// --- EXPORT THE CLASS, NOT AN INSTANCE ---
// index.ts is responsible for creating the instance
module.exports = SchemaService;
// module.exports = new SchemaService(db); // <-- DELETE this line


