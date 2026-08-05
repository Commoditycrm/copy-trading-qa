/**
 * A11Y structure & states — landmark/heading structure, table + pagination semantics, and the accessibility
 * of empty/loading states. Uses accessible roles (main/navigation/table/columnheader) so assertions track
 * the accessibility tree, not the DOM.
 */
import { test, expect, meta, seedSession } from '../../ui/fixtures/uiTest.js';
import { deleteUser } from '../../common/localAdmin.js';
import { makeSession } from '../setup.js';

test.describe('A11Y structure & states', () => {
  test.skip(({ config }) => config.envName !== 'local', 'a11y suite runs against the local full stack.');

  test('A11Y-LANDMARK the app shell exposes main + navigation landmarks and a single h1 @a11y @P1 @structure', async ({
    page,
    config,
  }, info) => {
    meta(info, 'AUTH-001');
    const s = await makeSession('subscriber');
    try {
      await seedSession(page, s.tokens);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.getByRole('main'), 'main landmark').toBeVisible();
      await expect(page.getByRole('navigation').first(), 'navigation landmark').toBeVisible();
      expect(await page.getByRole('heading', { level: 1 }).count(), 'exactly one h1').toBe(1);
    } finally {
      deleteUser(config, s.email);
    }
  });

  test('A11Y-TABLE admin Users renders a semantic table with column headers @a11y @P2 @structure', async ({
    page,
    config,
  }, info) => {
    meta(info, 'ADMIN-001');
    const s = await makeSession('subscriber', true);
    try {
      await seedSession(page, s.tokens);
      await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const table = page.getByRole('table').first();
      await expect(table, 'table role present').toBeVisible();
      expect(await table.getByRole('columnheader').count(), 'has column headers').toBeGreaterThan(0);
    } finally {
      deleteUser(config, s.email);
    }
  });

  test('A11Y-STATE the notifications empty-state is exposed as text (not colour/icon only) @a11y @P2 @state', async ({
    page,
    config,
  }, info) => {
    meta(info, 'NOTIF-001');
    const s = await makeSession('subscriber');
    try {
      await seedSession(page, s.tokens);
      await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.getByText(/all caught up/i), 'empty-state has a text label').toBeVisible();
    } finally {
      deleteUser(config, s.email);
    }
  });
});
