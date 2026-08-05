/**
 * Local email sink. With SENDGRID_API_KEY blank, the backend logs the email + link instead of sending
 * (services/email.py log mode). This reads the backend container logs and extracts the most recent
 * reset/verify token for a given email flow. No real email is ever sent.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import jwt from 'jsonwebtoken';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, '../local-stack/docker-compose.qa.yml');

function backendLogs(sinceSeconds = 120): string {
  try {
    return execSync(`docker compose -f "${compose}" logs backend --since ${sinceSeconds}s --no-color`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/** Count email send-attempts to an address; the log-mode line is followed by the body (link) on the next
 *  lines, so `contains` is matched within the ~600-char block after each `to=<address>` occurrence. */
export function emailAttemptsTo(address: string, contains?: string): number {
  const logs = backendLogs();
  const needle = `to=${address}`;
  let n = 0;
  let from = 0;
  for (;;) {
    const i = logs.indexOf(needle, from);
    if (i < 0) break;
    from = i + needle.length;
    const lineStart = logs.lastIndexOf('\n', i);
    const line = logs.slice(lineStart + 1, i);
    if (!line.includes('email:')) continue; // only the email log line, not other 'to=' occurrences
    if (contains && !logs.slice(i, i + 600).includes(contains)) continue;
    n += 1;
  }
  return n;
}
export function emailLoggedTo(address: string, contains?: string): boolean {
  return emailAttemptsTo(address, contains) > 0;
}

/** Extract the newest token value from a `?token=<jwt>` occurrence in the backend logs. */
export function latestTokenFromLogs(kind: 'reset-password' | 'verify-email' | 'any' = 'any'): string | null {
  const logs = backendLogs();
  const re = kind === 'any' ? /token=([A-Za-z0-9._-]{20,})/g : new RegExp(`${kind}\\?token=([A-Za-z0-9._-]{20,})`, 'g');
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(logs)) !== null) last = m[1] ?? last;
  return last;
}

/**
 * Return the newest token in the logs that belongs to THIS user (matched by decoding the JWT claim):
 * verify tokens carry `eml`, reset/verify tokens carry `sub` (the user id). Avoids picking another
 * concurrently-registered user's token from the shared sink.
 */
export function tokenForSubject(match: {
  email?: string;
  userId?: string;
  type?: 'reset' | 'verify' | 'email_change';
}): string | null {
  const logs = backendLogs();
  const re = /token=([A-Za-z0-9._-]{20,})/g;
  let m: RegExpExecArray | null;
  let found: string | null = null;
  while ((m = re.exec(logs)) !== null) {
    const tok = m[1]!;
    let claims: Record<string, unknown> | null = null;
    try {
      claims = jwt.decode(tok) as Record<string, unknown> | null;
    } catch {
      claims = null;
    }
    if (!claims) continue;
    // CRITICAL: filter by token TYPE — a verification token (from registration) shares the same sub as
    // a later reset token; without this filter the wrong token is picked (wrong_token_type → 400).
    if (match.type && claims.type !== match.type) continue;
    const subjectOk = (match.email && claims.eml === match.email) || (match.userId && claims.sub === match.userId);
    if (subjectOk) found = tok;
  }
  return found; // newest matching-type token wins
}
