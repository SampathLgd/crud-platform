import type { Knex } from "knex";

// Update with your config settings.

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection: {
      database: 'crud_platform', // Your DB name
      user:     'postgres',      // Your DB user
      password: 'zxcv#139'     // Your DB password
    },
    migrations: {
      tableName: "knex_migrations"
    }
  },
  test: {
    client: "pg",
    connection: {
      database: 'crud_platform_test', // A separate database for testing
      user:     'postgres',           // Your DB user
      password: 'zxcv#139'           // Your DB password
    },
    migrations: {
      tableName: "knex_migrations"
    }
  },

  staging: {
    client: "postgresql",
    connection: {
      database: "my_db",
      user: "username",
      password: "password"
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: "knex_migrations"
    }
  },

  production: {
    client: "postgresql",
    connection: {
      database: "my_db",
      user: "username",
      password: "password"
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: "knex_migrations"
    }
  }

};

module.exports = config;
