import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * /brokers — "Broker connections". The picker only offers Alpaca/SnapTrade/IBKR (no fake broker in the UI),
 * so a fake account is API-seeded; the UI drives the connect FORM validation and DISCONNECT of a seeded row.
 */
export class BrokersPage extends BasePage {
  readonly pageHeading = this.page.getByRole('heading', { name: /broker connections/i });

  async open(): Promise<void> {
    await this.goto('/brokers');
    await this.pageHeading.waitFor();
  }

  tile(name: 'Alpaca' | 'SnapTrade' | 'IBKR'): Locator {
    return this.page.getByRole('button', { name: new RegExp(name, 'i') });
  }

  readonly connect = this.page.getByRole('button', { name: 'Connect', exact: true });
  readonly disconnect = this.page.getByRole('button', { name: /disconnect/i });

  /** A connected account card located by its label text. */
  accountCard(label: string | RegExp): Locator {
    return this.page.getByText(label).locator('xpath=ancestor::*[self::li or self::div][1]');
  }
}
