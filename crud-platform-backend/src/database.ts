const knex = require('knex');
const knexConfig = require('../knexfile');

// Create the db instance
const db = knex(knexConfig.development);

// Export it
export = db;