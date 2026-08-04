import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** The authenticated (app) shell: header notification bell + sidebar sign-out + copy switch. */
export class AppShell extends BasePage {
  readonly bell = this.page.getByRole('button', { name: /notifications/i });
  readonly signOut = this.page.getByRole('button', { name: /sign out/i });
  readonly copySwitch = this.page.getByRole('switch');

  /** Unread count parsed from the bell's accessible name ("Notifications, N unread"); 0 when absent. */
  async unreadCount(): Promise<number> {
    const label = (await this.bell.getAttribute('aria-label')) || '';
    const m = label.match(/(\d+)\s*unread/i);
    return m ? Number(m[1]) : 0;
  }

  async openBell(): Promise<void> {
    await this.bell.click();
  }

  bellMenu(): Locator {
    return this.page.getByRole('menu');
  }

  async logout(): Promise<void> {
    await this.signOut.click();
  }
}

/** /notifications — full inbox. */
export class NotificationsPage extends BasePage {
  readonly emptyState = this.page.getByText(/all caught up/i);

  async open(): Promise<void> {
    await this.goto('/notifications');
  }

  item(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }
}
