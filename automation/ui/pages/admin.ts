import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** Admin area — /admin (Platform Overview), /admin/users, /admin/rejected. Body <h2> headings are stable. */
export class AdminPage extends BasePage {
  async openDashboard(): Promise<void> {
    await this.goto('/admin');
  }
  async openUsers(): Promise<void> {
    await this.goto('/admin/users');
  }
  async openRejected(): Promise<void> {
    await this.goto('/admin/rejected');
  }

  readonly overviewHeading = this.page.getByRole('heading', { name: /platform overview/i });
  readonly usersHeading = this.page.getByRole('heading', { name: 'Users', level: 2 });
  readonly rejectedHeading = this.page.getByRole('heading', { name: /rejected trades/i });
  readonly rejectedTable = this.page.getByRole('table');

  readonly search = this.page.getByRole('searchbox').or(this.page.getByPlaceholder(/search/i));

  userRow(email: string | RegExp): Locator {
    return this.page.getByRole('row', { name: email }).first();
  }

  /** A rejected-orders table row containing the given text (symbol / email / reason). Scoped to the table
   *  so it can't match a filter chip or heading. */
  rejectedRowFor(text: string | RegExp): Locator {
    return this.rejectedTable.getByRole('row').filter({ hasText: text });
  }

  actionInRow(email: string | RegExp, name: RegExp): Locator {
    return this.userRow(email).getByRole('button', { name });
  }
}
