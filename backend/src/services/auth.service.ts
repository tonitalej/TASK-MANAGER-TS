// Service = business rules. No HTTP (req/res) in here, no raw SQL either.
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import * as users from '../repositories/user.repository.js';
import { AppError } from '../utils/AppError.js';
import type { LoginInput, RegisterInput, User } from '../types/models.js';

export interface AuthResult { user: User; token: string }

// Used when the email doesn't exist, so login takes the same time either way
// (otherwise response time would reveal which emails are registered).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.bcryptRounds);

// The payload carries ONLY "sub" (user id) plus iat/exp added by the library. Anything in a JWT
// is readable by whoever holds it (it is signed, not encrypted), so we put nothing else in it.
function signToken(user: User): string {
  return jwt.sign({}, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export async function register({ name, email, password }: RegisterInput): Promise<AuthResult> {
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds); // salted automatically
  try {
    const user = await users.create({ name, email, passwordHash });
    return { user, token: signToken(user) };
  } catch (err) {
    // The UNIQUE constraint is the real guard (a "check first" query could race).
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    }
    throw err;
  }
}

export async function login({ email, password }: LoginInput): Promise<AuthResult> {
  const found = await users.findByEmail(email);
  const matches = await bcrypt.compare(password, found ? found.password_hash : DUMMY_HASH);
  if (!found || !matches) {
    // Same message for "no such email" and "wrong password" on purpose.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const { password_hash: _removed, ...user } = found; // strip the hash before returning
  return { user, token: signToken(user) };
}

export async function getProfile(userId: string): Promise<User> {
  const user = await users.findById(userId);
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User no longer exists');
  return user;
}
