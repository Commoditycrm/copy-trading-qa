import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * /settings — the subscriber "Traders" card (request-to-follow / follow / multiplier + Save) and
 * "Risk Controls". Card titles are <h2>. The multiplier is a spinbutton with a nearby "Save".
 */
export class SettingsPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/settings');
  }

  tradersCard(): Locator {
    return this.page.getByRole('heading', { name: 'Traders', level: 2 }).locator('..');
  }

  /** A trader row located by its display/business name text (nearest ancestor that holds the row's button). */
  traderRow(name: string | RegExp): Locator {
    return this.page.getByText(name).locator('xpath=ancestor::*[.//button][1]');
  }

  requestToFollow(name: string | RegExp): Locator {
    return this.traderRow(name).getByRole('button', { name: /request to follow|request again|^follow$/i });
  }

  // The copy-size multiplier is the only number input bounded 0.1–10 (other /settings spinbuttons differ).
  readonly multiplier = this.page.locator('input[step="0.1"][max="10"]').first();
  readonly saveMultiplier = this.multiplier.locator('xpath=following::button[normalize-space()="Save"][1]');

  async setMultiplier(value: number): Promise<void> {
    await this.multiplier.fill(String(value));
    await this.saveMultiplier.click();
  }
}

/** /subscribers — trader-side follow-request approvals (FollowRequestsPanel). */
export class SubscribersPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/subscribers');
  }

  requestsPanel(): Locator {
    return this.page.getByRole('heading', { name: /follow requests/i }).locator('..');
  }

  approveFor(name: string | RegExp): Locator {
    return this.page
      .getByText(name)
      .locator('xpath=ancestor::*[self::li or self::div][1]')
      .getByRole('button', { name: /approve/i });
  }

  declineFor(name: string | RegExp): Locator {
    return this.page
      .getByText(name)
      .locator('xpath=ancestor::*[self::li or self::div][1]')
      .getByRole('button', { name: /decline/i });
  }
}
