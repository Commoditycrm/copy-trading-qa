import { expect, type Page, type Locator } from '@playwright/test';

/** Shared page-object base. Accessible-selector helpers live on subclasses. */
export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
  }

  /** Wait for React to finish hydrating so controlled inputs stop resetting (network settles). */
  async waitHydrated(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  /**
   * Hydration-safe fill: Next 15/React 19 can reset a controlled input when it hydrates just after a
   * fast fill, leaving the field blank. Retry the fill until the typed value actually sticks.
   */
  protected async fillStable(locator: Locator, value: string): Promise<void> {
    await expect(async () => {
      await locator.fill(value);
      await expect(locator).toHaveValue(value, { timeout: 300 });
    }).toPass({ timeout: 6000 });
  }

  heading(name: string | RegExp, level?: number): Locator {
    return this.page.getByRole('heading', level ? { name, level } : { name });
  }

  /** Wait until the URL path matches (bounded by the test timeout — no fixed sleep). */
  async expectPath(re: RegExp): Promise<void> {
    await this.page.waitForURL(re);
  }
}
