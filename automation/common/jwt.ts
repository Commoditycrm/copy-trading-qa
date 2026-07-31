/**
 * QA-only JWT minting for authorization tests. Uses the QA JWT secret (never a
 * production secret) to forge access tokens for negative/authZ scenarios:
 * wrong role, expired, malformed sub, wrong token type. Mirrors the app's token
 * shape (see backend/app/core/security.py): {sub, role, type, iat, exp}.
 */
import jwt from 'jsonwebtoken';
import type { QaConfig } from './config.js';

export type Role = 'trader' | 'subscriber' | 'admin';

function secretOf(config: QaConfig): string {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET (QA-only) is required to mint test tokens. Set it in the QA env, never a prod secret.');
  }
  return config.jwtSecret;
}

/** A valid access token for a given subject/role. */
export function mintAccess(config: QaConfig, sub: string, role: Role, ttlSeconds = 1800): string {
  return jwt.sign({ sub, role, type: 'access' }, secretOf(config), { algorithm: 'HS256', expiresIn: ttlSeconds });
}

/** An already-expired access token (for 401 tests). */
export function mintExpiredAccess(config: QaConfig, sub: string, role: Role): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub, role, type: 'access', iat: now - 7200, exp: now - 3600 }, secretOf(config), {
    algorithm: 'HS256',
  });
}

/** A token of the wrong type (e.g. refresh presented as access). */
export function mintWrongType(config: QaConfig, sub: string, type = 'refresh'): string {
  return jwt.sign({ sub, type }, secretOf(config), { algorithm: 'HS256', expiresIn: 1800 });
}

/** A structurally malformed / non-UUID sub token (for the documented refresh-500 defect check). */
export function mintMalformedSub(config: QaConfig): string {
  return jwt.sign({ sub: 'not-a-uuid', type: 'refresh' }, secretOf(config), { algorithm: 'HS256', expiresIn: 1800 });
}
