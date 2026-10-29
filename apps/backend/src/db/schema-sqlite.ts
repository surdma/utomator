import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable(
  'utomator_documents',
  {
    ownerId: text('owner_id').notNull(),
    namespace: text('namespace').notNull(),
    key: text('record_key').notNull(),
    version: integer('version').notNull(),
    payload: text('payload').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.namespace, table.key] })],
);
