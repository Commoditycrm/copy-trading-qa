/**
 * Secret & evidence redaction. Any captured evidence (request/response bodies,
 * headers, logs, HAR) MUST pass through here before being stored/attached, so no
 * token, key, or secret ever lands in reports/. Synthetic emails (*.kopyya.test)
 * are left intact; anything token-shaped is masked.
 */

const MASK = '***REDACTED***';

/** Header names whose values are always masked. */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token'];

/** JSON keys whose values are always masked (case-insensitive). */
const SENSITIVE_KEYS = [
  'password',
  'new_password',
  'token',
  'access',
  'refresh',
  'access_token',
  'refresh_token',
  'jwt',
  'secret',
  'api_key',
  'api_secret',
  'apikey',
  'consumer_key',
  'signing_key',
  'access_token_secret',
  'encrypted_credentials',
  'user_secret',
  'snaptrade_user_secret',
  'authorization',
];

const PATTERNS: Array<[RegExp, string]> = [
  // Bearer / JWT-like triple-segment tokens
  [/Bearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${MASK}`],
  [/\beyJ[A-Za-z0-9._-]{10,}/g, MASK], // base64url JWT header prefix
  // Alpaca-style key ids and Fernet-ish blobs
  [/\bPK[A-Z0-9]{10,}\b/g, MASK],
  [/\bgAAAAA[A-Za-z0-9._-]{10,}/g, MASK],
];

export function redactString(input: string): string {
  let out = input;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.includes(k.toLowerCase()) ? MASK : redactString(v);
  }
  return out;
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? MASK : redact(v);
    }
    return out;
  }
  return value;
}

/** Convenience: redact then pretty-print for an Allure attachment. */
export function redactedJson(value: unknown): string {
  return JSON.stringify(redact(value), null, 2);
}
