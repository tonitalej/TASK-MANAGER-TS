import pg from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

// By default node-postgres turns a DATE column into a JavaScript Date at LOCAL midnight,
// which can shift to the previous day when serialized to JSON (time zone bug).
// Returning the raw 'YYYY-MM-DD' string avoids that entirely.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

// One pool for the whole app: connections are reused instead of opening a new
// TCP + authentication handshake for every request.
const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  // Supabase requires SSL. The connection IS encrypted, but rejectUnauthorized:false skips
  // checking the server's certificate, so a man-in-the-middle could impersonate the database.
  // Stricter option: download Supabase's CA certificate and pass it as ssl: { ca }.
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000, // give up if no connection within 5 s
  statement_timeout: 10_000,      // the server cancels any query running longer than 10 s
});

// An idle client can error (e.g. the DB restarted). Without this handler Node would crash.
pool.on('error', (err) => { logger.error({ err }, 'Idle database client error'); });

// Every query in the app goes through db.query(sqlWithPlaceholders, [values]):
// values never become part of the SQL text. (It is a plain object on purpose,
// so tests can replace db.query to simulate a database failure.)
export const db = {
  query: <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) =>
    pool.query<R>(text, params),
  pool,
};
