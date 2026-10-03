// Reads and validates ALL configuration once, at startup ("fail fast").
// If anything is wrong the process stops with a list of problems.
// Error messages name the variable and the rule, but NEVER print the value (it may be a secret).
import 'dotenv/config'; // loads .env into process.env (existing process.env values win)

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

const problems: string[] = [];

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = read(name);
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  problems.push(`${name} must be one of: ${allowed.join(', ')}`);
  return fallback;
}

function integer(name: string, min: number, max: number, fallback: number): number {
  const value = read(name);
  if (value === undefined) return fallback;
  const n = Number(value);
  if (Number.isInteger(n) && n >= min && n <= max) return n;
  problems.push(`${name} must be an integer between ${min} and ${max}`);
  return fallback;
}

function boolean(name: string, fallback: boolean): boolean {
  const value = read(name);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  problems.push(`${name} must be "true" or "false"`);
  return fallback;
}

function postgresUrl(name: string): string {
  const value = read(name);
  if (value === undefined) {
    problems.push(`${name} is required`);
    return '';
  }
  try {
    const { protocol, hostname } = new URL(value);
    if ((protocol === 'postgres:' || protocol === 'postgresql:') && hostname) return value;
  } catch { /* reported below */ }
  problems.push(`${name} must be a postgres:// or postgresql:// URL`);
  return '';
}

// "https://app.example.com,http://localhost:5173" -> ['https://app.example.com', 'http://localhost:5173']
function originList(name: string, fallback: string): string[] {
  const items = (read(name) ?? fallback).split(',').map((s) => s.trim()).filter(Boolean);
  const valid = items.filter((item) => {
    try {
      const url = new URL(item);
      // An origin is scheme + host + port only: no path, no trailing slash, no wildcard.
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === item;
    } catch {
      return false;
    }
  });
  if (items.length === 0 || valid.length !== items.length) {
    problems.push(`${name} must be a comma-separated list of origins like https://app.example.com (no path, no "*")`);
  }
  return valid;
}

const nodeEnv: NodeEnv = oneOf('NODE_ENV', NODE_ENVS, 'development');

const jwtSecret = read('JWT_SECRET') ?? '';
// HS256 is only as strong as the secret. Production requires 32+ characters of randomness.
const minSecretLength = nodeEnv === 'production' ? 32 : 16;
if (jwtSecret.length < minSecretLength) {
  problems.push(`JWT_SECRET is required and must be at least ${minSecretLength} characters when NODE_ENV=${nodeEnv}`);
}

const jwtExpiresIn = read('JWT_EXPIRES_IN') ?? '1h';
if (!/^[1-9]\d*(s|m|h|d)?$/.test(jwtExpiresIn)) {
  problems.push('JWT_EXPIRES_IN must be a positive number of seconds or a duration like 15m, 1h, 7d');
}

export const env = {
  nodeEnv,
  port: integer('PORT', 1, 65535, 3000),
  databaseUrl: postgresUrl('DATABASE_URL'),
  databaseSsl: boolean('DATABASE_SSL', false),
  jwtSecret,
  jwtExpiresIn,
  bcryptRounds: integer('BCRYPT_ROUNDS', 10, 14, 10),
  corsOrigins: originList('CORS_ORIGIN', 'http://localhost:5173'),
  logLevel: oneOf<LogLevel>('LOG_LEVEL', LOG_LEVELS, nodeEnv === 'test' ? 'silent' : 'info'),
  authRateLimitMax: integer('AUTH_RATE_LIMIT_MAX', 1, 100_000, 10),
  authRateLimitWindowMs: integer('AUTH_RATE_LIMIT_WINDOW_MS', 1_000, 24 * 60 * 60 * 1000, 15 * 60 * 1000),
} as const;

if (problems.length > 0) {
  throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
}
