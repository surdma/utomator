import {integer,pgTable,primaryKey,text} from 'drizzle-orm/pg-core';

export const documents = pgTable('utomator_documents',{
  ownerId:text('owner_id').notNull(),
  namespace:text('namespace').notNull(),
  key:text('record_key').notNull(),
  version:integer('version').notNull(),
  payload:text('payload').notNull(),
  updatedAt:text('updated_at').notNull(),
},table=>[primaryKey({columns:[table.ownerId,table.namespace,table.key]})]);
