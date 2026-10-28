import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one } from './db.js';
import { HttpError, forbidden } from './errors.js';
import { can } from './rbac.js';

const JWT_SECRET = process.env.JWT_SECRET || 'stockroom-dev-secret-change-me';
const TOKEN_TTL = '8h';

export const hashPassword = (plain) => bcrypt.hashSync(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });

/**
 * Verifies the bearer token, then re-reads the user from the database on every
 * request. Role changes and deactivations therefore take effect immediately,
 * rather than whenever the token happens to expire.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Sign in to continue');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Your session has expired');
  }

  const user = one('SELECT id, name, email, role, title, active FROM users WHERE id = ?', payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'This account is disabled');
  req.user = { ...user };
  next();
}

export const requirePermission = (...permissions) => (req, _res, next) => {
  const missing = permissions.filter((p) => !can(req.user, p));
  if (missing.length) throw forbidden(`Your role (${req.user.role}) is missing: ${missing.join(', ')}`);
  next();
};
