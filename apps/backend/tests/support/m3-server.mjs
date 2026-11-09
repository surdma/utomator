import { createClient } from '@libsql/client';
import { buildApp } from '../../src/main.ts';

// A separate process makes the restart check exercise disk recovery, not old maps.
if (process.env.NODE_ENV !== 'test' || process.env.UTOMATOR_TEST_DATABASE !== 'true') {
  throw new Error('The M3 fixture server requires an isolated test database');
}
const database = createClient({ url: process.env.DB_FILE_NAME });
await database.execute(`CREATE TABLE IF NOT EXISTS utomator_documents (
  owner_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  record_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, namespace, record_key)
)`);
database.close();

const app = buildApp();
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT) });
process.once('SIGTERM', () => {
  void app.close().then(() => process.exit(0));
});
