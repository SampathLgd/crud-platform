import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // This function runs when you migrate
  return knex.schema.table('users', function(table) {
    table.string('resetToken');
    table.bigInteger('resetTokenExpiry');
  });
}

export async function down(knex: Knex): Promise<void> {
  // This function runs if you roll back
  return knex.schema.table('users', function(table) {
    table.dropColumn('resetToken');
    table.dropColumn('resetTokenExpiry');
  });
}