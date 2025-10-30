import type { Knex } from "knex"; // Import the 'Knex' type

// Use 'exports.up' for CommonJS compatibility
exports.up = async function(knex: Knex): Promise<void> {
  // This code runs when you "migrate"
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email').notNullable().unique();
    table.string('password').notNullable();
    
    // Define the roles as per the assignment
    table.enum('role', ['Admin', 'Manager', 'Viewer']).notNullable().defaultTo('Viewer');
    
    table.timestamps(true, true);
  });
};

// Use 'exports.down' for CommonJS compatibility
exports.down = async function(knex: Knex): Promise<void> {
  // This code runs when you "rollback"
  await knex.schema.dropTable('users');
};