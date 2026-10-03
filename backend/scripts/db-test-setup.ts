// npm run db:test:setup
// Applies db/schema.sql (tables, constraints, triggers) to the TEST database.
// schema.sql starts by dropping the tables, so this also resets the test database.
// seed.sql is deliberately NOT applied: the tests create their own users.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { testDatabaseSsl, testDatabaseUrl } from './test-db.js';

const schema = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({
  connectionString: testDatabaseUrl(),
  ssl: testDatabaseSsl() === 'true' ? { rejectUnauthorized: false } : false,
});

await client.connect();
try {
  await client.query(schema); // no parameters, so pg sends the whole file as one multi-statement query
  console.log('Applied db/schema.sql to the TEST database.');
} finally {
  await client.end();
}
