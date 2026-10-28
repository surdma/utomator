import 'dotenv/config';
import {defineConfig} from 'drizzle-kit';

const connection=process.env.DATABASE_URL?.trim();
const sqlite=process.env.DB_FILE_NAME?.trim()||'file:local.db';
if(connection && !/^postgres(?:ql)?:\/\//i.test(connection))
  throw Error('DATABASE_URL must use postgres:// or postgresql://');

export default defineConfig(connection ? {
  dialect:'postgresql',
  schema:'./src/db/schema-postgres.ts',
  out:'./drizzle/postgres',
  dbCredentials:{url:connection},
} : {
  dialect:'sqlite',
  schema:'./src/db/schema-sqlite.ts',
  out:'./drizzle/sqlite',
  dbCredentials:{url:sqlite},
});
