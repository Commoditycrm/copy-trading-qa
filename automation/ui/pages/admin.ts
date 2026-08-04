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

  readonly search = this.page.getByRole('searchbox').or(this.page.getByPlaceholder(/search/i));

  userRow(email: string | RegExp): Locator {
    return this.page.getByRole('row', { name: email }).first();
  }

  actionInRow(email: string | RegExp, name: RegExp): Locator {
    return this.userRow(email).getByRole('button', { name });
  }
}
