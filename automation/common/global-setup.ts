/**
 * Playwright global setup — runs ONCE before any test. Enforces the environment
 * guardrails at the very start of a run so a misconfigured target fails fast and
 * loudly rather than mid-suite.
 */
import { loadConfig, isProduction } from './config.js';

export default async function globalSetup(): Promise<void> {
  const cfg = loadConfig();
  const banner =
    `\n[QA] env=${cfg.envName} broker=${cfg.brokerMode} api=${cfg.apiBaseUrl}` +
    ` paperAuthorized=${cfg.paperAuthorized}\n`;
  // eslint-disable-next-line no-console
  console.log(banner);

  // Production must be broker-none (read-only smoke only).
  if (isProduction(cfg) && cfg.brokerMode !== 'none') {
    throw new Error(
      `[SAFETY] Refusing to run: production target with BROKER_MODE=${cfg.brokerMode}. ` +
        `Production runs must be read-only smoke (BROKER_MODE=none).`,
    );
  }

  // Non-prod suites that mint tokens need a QA-only JWT secret.
  if (!isProduction(cfg) && !cfg.jwtSecret) {
    console.warn('[QA] JWT_SECRET not set — authZ token-minting tests will be skipped until it is provided.');
  }

  // The paper broker must never be the default; it is opt-in and manual.
  if (cfg.brokerMode === 'paper' && !cfg.paperAuthorized) {
    throw new Error('[SAFETY] BROKER_MODE=paper without PAPER_SUITE_AUTHORIZED=true. The paper suite is manual-only.');
  }
}
