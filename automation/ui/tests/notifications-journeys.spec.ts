/**
 * WF-20 — Notification inbox + unread badge through the UI. A notification is seeded via the grey-box
 * driver (setup); the badge, dropdown, mark-all-read and inbox are all asserted/driven in the browser.
 */
import { test, expect, meta, seedSession } from '../fixtures/uiTest.js';
import { AppShell, NotificationsPage } from '../pages/shell.js';
import { makeUser } from '../../common/factory.js';
import { deleteUser } from '../../common/localAdmin.js';
import * as authApi from '../../api/clients/authApi.js';
import { MockBroker } from '../../common/mockBrokerClient.js';

test.describe('WF-20 Notifications (UI)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'UI E2E runs against the local full stack.');

  test('TC-WF-20-001 unread badge, inbox listing, and mark-all-read @ui @P2 @integration', async ({ page, config, api }, info) => {
    meta(info, 'WF-20', ['NOTIF-001']);
    const u = makeUser('subscriber');
    const acct = await authApi.registerAndLogin(api, u);
    const mb = new MockBroker(config);
    try {
      mb.createNotif(acct.id, 'copy.rejected', 'QA mirror was rejected');
      mb.createNotif(acct.id, 'copy.rejected', 'QA another rejection');

      await seedSession(page, { access: acct.access, refresh: acct.refresh });
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      const shell = new AppShell(page);

      // unread badge reflects the seeded notifications.
      await expect.poll(() => shell.unreadCount(), { timeout: 10000 }).toBeGreaterThanOrEqual(2);

      // inbox lists them (not the empty state).
      const inbox = new NotificationsPage(page);
      await inbox.open();
      await expect(inbox.emptyState).toHaveCount(0);
      await expect(page.getByText(/rejected/i).first()).toBeVisible();

      // mark all read via the bell dropdown → badge clears.
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await shell.openBell();
      await page.getByRole('button', { name: /mark all read/i }).click();
      await expect.poll(() => shell.unreadCount(), { timeout: 10000 }).toBe(0);
    } finally {
      deleteUser(config, u.email);
    }
  });
});
