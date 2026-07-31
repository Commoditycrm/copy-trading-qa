/**
 * Safety guards — the hard rules from docs/TEST_STRATEGY.md and the approved
 * decisions. These THROW rather than warn: a violated guard must fail the test
 * run loudly, never silently proceed.
 *
 *  - Production is READ-ONLY. No writes, no orders, no user/broker/config changes.
 *  - Destructive tests require a fake broker and a non-prod environment.
 *  - The Alpaca Paper suite is manual-only and must be explicitly authorized.
 */
import type { QaConfig } from './config.js';
import { isProduction } from './config.js';

/** HTTP methods that mutate server state. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Endpoint substrings that are allowed to be POSTed even on prod (idempotent, read-shaped). */
const PROD_ALLOWED_POST = ['/api/auth/login']; // login issues a token but creates no business data

export class SafetyViolation extends Error {
  constructor(message: string) {
    super(`[SAFETY] ${message}`);
    this.name = 'SafetyViolation';
  }
}

/** Block any mutating request against production. Call this in the request wrapper. */
export function assertRequestAllowed(config: QaConfig, method: string, url: string): void {
  if (!isProduction(config)) return;
  const m = method.toUpperCase();
  if (!MUTATING_METHODS.has(m)) return;
  if (PROD_ALLOWED_POST.some((p) => url.includes(p))) return;
  throw new SafetyViolation(
    `Blocked ${m} ${url} against PRODUCTION. Production tests are read-only smoke only ` +
      `(no order placement, no user/broker/config changes, no seed/cleanup).`,
  );
}

/** A @destructive test must run only with a fake broker on a non-prod env. */
export function assertDestructiveAllowed(config: QaConfig): void {
  if (isProduction(config)) {
    throw new SafetyViolation('Destructive tests must never run against production.');
  }
  if (config.brokerMode !== 'fake') {
    throw new SafetyViolation(
      `Destructive tests require BROKER_MODE=fake (got "${config.brokerMode}"). ` +
        `Never place real-money or paper orders in destructive suites.`,
    );
  }
}

/** The Alpaca Paper contract suite is manual-only and must be explicitly authorized. */
export function assertPaperSuiteAllowed(config: QaConfig): void {
  if (isProduction(config)) throw new SafetyViolation('Paper suite must not target production.');
  if (config.brokerMode !== 'paper') {
    throw new SafetyViolation(`Paper suite requires BROKER_MODE=paper (got "${config.brokerMode}").`);
  }
  if (!config.paperAuthorized) {
    throw new SafetyViolation(
      'Paper suite requires PAPER_SUITE_AUTHORIZED=true (manual trigger, DevOps-owned creds). ' +
        'It is disabled by default and never runs in automatic pipelines.',
    );
  }
}

/** A @prod-safe test must contain no mutating intent. Assert the broker is not live. */
export function assertProdSafe(config: QaConfig): void {
  if (config.brokerMode !== 'none' && isProduction(config)) {
    throw new SafetyViolation('Production smoke must run with BROKER_MODE=none (no broker interaction).');
  }
}
