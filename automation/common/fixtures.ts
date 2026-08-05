/**
 * Shared Playwright test fixtures. Every auth/authZ spec imports { test, expect } from here so it gets:
 *  - config:  the resolved QaConfig
 *  - api:     a SafeApi wrapper (production write-block + redacted evidence) over APIRequestContext
 *  - meta():  helper to record Primary/Related Functionality IDs on the test (traceability)
 */
import { test as base, expect, type TestInfo } from '@playwright/test';
import { loadConfig, type QaConfig } from './config.js';
import { SafeApi } from './api.js';

export const test = base.extend<{ config: QaConfig; api: SafeApi }>({
  config: async ({}, use) => {
    await use(loadConfig());
  },
  api: async ({ request, config }, use) => {
    await use(new SafeApi(request, config));
  },
});

export { expect };

/** Record traceability metadata on the current test (primary + related Functionality IDs). */
export function meta(info: TestInfo, primaryFuncId: string, relatedFuncIds: string[] = []): void {
  info.annotations.push({ type: 'primary_func_id', description: primaryFuncId });
  if (relatedFuncIds.length)
    info.annotations.push({ type: 'related_func_ids', description: relatedFuncIds.join(', ') });
}
