/**
 * WF-08 / WF-09 — Follow-request → approval and copy-multiplier journeys through the UI.
 * Actions (request-to-follow, approve, set multiplier, toggle copy) are performed in the browser;
 * accounts are API-seeded and follow-state is asserted via DB helpers.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { SettingsPage, SubscribersPage } from '../pages/settings.js';
import { AppShell } from '../pages/shell.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser } from '../../common/localAdmin.js';
import * as authApi from '../../api/clients/authApi.js';
import { subSetting } from '../../common/tradingSetup.js';

test.describe('WF-08/09 Follow + copy journeys (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-09-001 subscriber sets the copy multiplier and it persists across reload @ui @P1 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-09', ['RISK-001', 'COPY-001']);
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    const settings = new SettingsPage(page);
    try {
      await seedSession(page, { access: acct.access, refresh: acct.refresh });
      await settings.open();
      await expect(settings.multiplier).toBeVisible();
      await settings.setMultiplier(3.5);
      await expect(page.getByText('×3.5').first()).toBeVisible();
      // persistence: reload and confirm the value stuck.
      await settings.open();
      await expect(settings.multiplier).toHaveValue('3.5');
      await expect.poll(() => Number(subSetting(config, acct.id, 'multiplier'))).toBe(3.5);
    } finally {
      deleteUser(config, u.email);
    }
  });

  test('TC-WF-08-001 subscriber requests to follow a trader and the trader approves @ui @P1 @integration', async ({
    page,
    browser,
    config,
    api,
  }, info) => {
    meta(info, 'WF-08', ['FOLLOW-001', 'AUTHZ-001']);
    const traderU = makeUser('trader');
    const subU = makeUser('subscriber');
    const trader = await authApi.registerAndLogin(api, traderU);
    const sub = await authApi.registerAndLogin(api, subU);
    let traderCtx;
    try {
      // Subscriber requests to follow, through the UI.
      await seedSession(page, { access: sub.access, refresh: sub.refresh });
      const settings = new SettingsPage(page);
      await settings.open();
      const row = settings.traderRow(traderU.business_name!);
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: /request to follow/i }).click();
      await expect(row.getByText(/requested/i)).toBeVisible();

      // Trader approves, in a separate browser context, through the UI.
      traderCtx = await browser.newContext();
      const tpage = await traderCtx.newPage();
      await seedSession(tpage, { access: trader.access, refresh: trader.refresh });
      const subsPage = new SubscribersPage(tpage);
      await subsPage.open();
      // exactly one incoming request for this fresh trader.
      const approve = tpage.getByRole('button', { name: 'Approve', exact: true });
      await expect(approve).toBeVisible();
      await approve.click();

      // Approval auto-follows server-side.
      await expect.poll(() => subSetting(config, sub.id, 'following_trader_id'), { timeout: 10000 }).toBe(trader.id);
    } finally {
      if (traderCtx) await traderCtx.close();
      deleteUser(config, traderU.email);
      deleteUser(config, subU.email);
    }
  });

  test('TC-WF-09-002 subscriber toggles the copy master switch @ui @P2 @integration', async ({
    page,
    config,
    api,
  }, info) => {
    meta(info, 'WF-09', ['COPY-001']);
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    try {
      await seedSession(page, { access: acct.access, refresh: acct.refresh });
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      const shell = new AppShell(page);
      await expect(shell.copySwitch).toBeVisible();
      const before = await shell.copySwitch.getAttribute('aria-checked');
      await shell.copySwitch.click();
      await expect.poll(() => shell.copySwitch.getAttribute('aria-checked')).not.toBe(before);
    } finally {
      deleteUser(config, u.email);
    }
  });
});
