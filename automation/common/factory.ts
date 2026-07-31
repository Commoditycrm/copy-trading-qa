/**
 * Synthetic test-data factory. All identities use the reserved *.kopyya.test domain and are namespaced
 * by a run id so parallel workers never collide (docs/TEST_DATA_STRATEGY.md). No real data, ever.
 */
import { faker } from '@faker-js/faker';

// Run id: injected by CI (QA_RUN_ID) or derived once per process. Date.now() is fine in test code.
export const RUN_ID = process.env.QA_RUN_ID || `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// Synthetic QA domain. NOTE: the app's Pydantic EmailStr rejects IANA special-use TLDs
// (.test/.example/.invalid/.localhost) with "special-use or reserved name", so register-based flows
// use a non-special-use synthetic domain. See docs/TEST_DATA_STRATEGY.md (Test-Data finding TD-001).
export const QA_EMAIL_DOMAIN = process.env.QA_EMAIL_DOMAIN || 'qa.kopyya.dev';

export type Role = 'trader' | 'subscriber';

export interface NewUser {
  email: string;
  password: string;
  role: Role;
  display_name: string;
  business_name?: string;
  /** Synthetic client IP — sent as X-Forwarded-For so per-IP rate limits don't bleed across tests. */
  clientIp: string;
}

let seq = 0;

/** A unique synthetic client IP (per user) to isolate the per-IP register/login throttles. */
export function makeIp(): string {
  return `10.${faker.number.int({ min: 1, max: 254 })}.${faker.number.int({ min: 1, max: 254 })}.${faker.number.int({ min: 1, max: 254 })}`;
}

/** A registrable user with a policy-compliant password (≥8, ≥3 char classes). */
export function makeUser(role: Role, opts: Partial<NewUser> = {}): NewUser {
  seq += 1;
  const email = opts.email ?? `qa+${role}-${RUN_ID}-${seq}@${QA_EMAIL_DOMAIN}`;
  const password = opts.password ?? `Qa!${faker.string.alphanumeric(10)}9`;
  const base: NewUser = {
    email,
    password,
    role,
    display_name: opts.display_name ?? `QA ${role} ${seq}`,
    clientIp: opts.clientIp ?? makeIp(),
  };
  if (role === 'trader') base.business_name = opts.business_name ?? `QA Signals ${RUN_ID}-${seq}`;
  return base;
}
