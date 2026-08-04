import { expect, type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** /trade-panel — trader order entry. Defaults to OPTIONS; switch to STOCKS for a plain equity order. */
export class TradePanelPage extends BasePage {
  readonly stocksTab = this.page.getByRole('button', { name: /^stocks$/i });
  readonly symbol = this.page.getByPlaceholder('AAPL');
  readonly quantity = this.page.getByRole('spinbutton').first();
  readonly buyMarket = this.page.getByRole('button', { name: /^buy\s*market$/i });

  async open(): Promise<void> {
    await this.goto('/trade-panel');
    await this.waitHydrated();
  }

  async selectStocks(): Promise<void> {
    await this.stocksTab.click();
    await expect(this.buyMarket).toBeEnabled();
  }

  async placeMarketBuy(symbol: string, qty: number): Promise<void> {
    await this.selectStocks();
    await this.fillStable(this.symbol, symbol);
    await this.fillStable(this.quantity, String(qty));
    await this.buyMarket.click();
  }
}

/** /trades — order history with status tabs. */
export class TradesPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/trades');
  }

  tab(name: 'All' | 'Working' | 'Filled' | 'Cancelled' | 'Rejected'): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  rowFor(symbol: string | RegExp): Locator {
    return this.page.getByRole('row', { name: symbol }).first();
  }

  anyRowWith(text: string | RegExp): Locator {
    return this.page.getByText(text).first();
  }
}

/** /positions — open positions table + bulk-exit bar. */
export class PositionsPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/positions');
  }

  rowFor(symbol: string | RegExp): Locator {
    return this.page.getByRole('row', { name: symbol }).first();
  }

  closeFor(symbol: string | RegExp): Locator {
    return this.rowFor(symbol).getByRole('button', { name: /close/i });
  }
}

/** /calendar — month P&L grid. */
export class CalendarPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/calendar');
  }
}

/** /performance — fanout/performance view (trader). */
export class PerformancePage extends BasePage {
  async open(): Promise<void> {
    await this.goto('/performance');
  }
}
