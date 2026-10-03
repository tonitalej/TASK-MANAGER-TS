// Repository = the ONLY layer that contains SQL. Nothing else touches the database.
import { db } from '../config/db.js';
import type { User, UserWithHash } from '../types/models.js';

const PUBLIC_COLUMNS = 'id, name, email, role, created_at'; // never includes password_hash

export async function findByEmail(email: string): Promise<UserWithHash | null> {
  const { rows } = await db.query<UserWithHash>(
    'SELECT id, name, email, role, created_at, password_hash FROM users WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await db.query<User>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function create(data: { name: string; email: string; passwordHash: string }): Promise<User> {
  const { rows } = await db.query<User>(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [data.name, data.email, data.passwordHash],
  );
  const user = rows[0];
  if (!user) throw new Error('INSERT ... RETURNING returned no row');
  return user;
}
