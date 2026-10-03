// Safety guard shared by the tests and the test scripts.
// Tests create and delete rows, so they must NEVER run against the real database.
// Rule: tests use TEST_DATABASE_URL only, and refuse to start if it points at the same
// database as DATABASE_URL. Error messages never print the URLs (they contain passwords).
import { config } from 'dotenv';

config({ quiet: true }); // load backend/.env (values already in the environment win)

// Two URLs can reach the same database with different text (other port, pooler host...).
// For Supabase we compare the project ref, which is in the host (db.<ref>.supabase.co)
// or in the pooler user name (postgres.<ref>). Otherwise compare host + database name.
function databaseIdentity(url: string): string {
  try {
    const u = new URL(url);
    const ref = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname)?.[1]
      ?? /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(u.username))?.[1];
    if (ref) return `supabase:${ref.toLowerCase()}`;
    return `${u.hostname.toLowerCase()}${u.pathname}`;
  } catch {
    return url;
  }
}

export function testDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Tests never use DATABASE_URL. See "Test database" in README.md.');
  }
  const mainUrl = process.env.DATABASE_URL?.trim();
  if (mainUrl && (testUrl === mainUrl || databaseIdentity(testUrl) === databaseIdentity(mainUrl))) {
    throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL. Refusing to continue.');
  }
  return testUrl;
}

/** TEST_DATABASE_SSL, falling back to DATABASE_SSL (both "true"/"false"). */
export function testDatabaseSsl(): string {
  return process.env.TEST_DATABASE_SSL?.trim() || process.env.DATABASE_SSL?.trim() || 'false';
}
