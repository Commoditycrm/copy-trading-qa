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

  /** The Traders list is search-gated — it's empty until you search. Type a name/email to reveal rows. */
  async searchTrader(query: string): Promise<void> {
    await this.page.getByPlaceholder(/search traders/i).fill(query);
  }

  /** A trader row located by its display/business name text (nearest ancestor that holds the row's button). */
  traderRow(name: string | RegExp): Locator {
    return this.page.getByText(name).locator('xpath=ancestor::*[.//button][1]');
  }

  requestToFollow(name: string | RegExp): Locator {
    return this.traderRow(name).getByRole('button', { name: /request to follow|request again|^follow$/i });
  }

  // The copy-size multiplier is a native <select> (SelectInput, aria-label "Copy size multiplier"),
  // options ×0.25/×0.5 then 1–10 in 0.5 steps — no longer a free number input.
  readonly multiplier = this.page.getByLabel('Copy size multiplier');
  readonly saveMultiplier = this.multiplier.locator('xpath=following::button[normalize-space()="Save"][1]');

  async setMultiplier(value: number): Promise<void> {
    await this.multiplier.selectOption(String(value));
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
