/**
 * Canonical tag vocabulary + suite-selection helpers. Tags are metadata and drive
 * CI selection; they are NEVER part of a Test Case ID (see docs/TEST_CASE_STANDARD.md).
 * Playwright reads tags from the test title (e.g. test('TC-AUTH-002-001 login @api @P1', …))
 * or the `tag` option; use TAGS constants so spelling stays consistent.
 */
export const TAGS = {
  // suite / level
  smoke: '@smoke',
  api: '@api',
  ui: '@ui',
  integration: '@integration',
  security: '@security',
  a11y: '@a11y',
  perf: '@perf',
  // speed
  fast: '@fast',
  slow: '@slow',
  // priority
  P1: '@P1',
  P2: '@P2',
  P3: '@P3',
  P4: '@P4',
  // type
  negative: '@negative',
  boundary: '@boundary',
  concurrency: '@concurrency',
  idempotency: '@idempotency',
  regression: '@regression',
  // role
  trader: '@trader',
  subscriber: '@subscriber',
  admin: '@admin',
  anon: '@anon',
  // safety
  prodSafe: '@prod-safe',
  destructive: '@destructive',
  paper: '@paper',
  brokerContract: '@broker-contract',
  // data
  requiresFakeBroker: '@requires-fake-broker',
  requiresSeed: '@requires-seed',
} as const;

/** Build a Playwright grep expression from a list of required tags (AND). */
export function grepAll(tags: string[]): RegExp {
  return new RegExp(tags.map((t) => `(?=.*${t.replace('@', '@')})`).join(''));
}
