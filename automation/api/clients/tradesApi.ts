/**
 * Trades API client — /api/trades surface. Order placement is trader-only and takes the broker account
 * as a query param. All mutating calls go through SafeApi (prod write-block + redacted evidence).
 */
import type { APIResponse } from '@playwright/test';
import type { SafeApi } from '../../common/api.js';

export interface PlaceOrder {
  instrument_type: 'stock' | 'option';
  symbol: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number | string;
  limit_price?: number;
  stop_price?: number;
  take_profit_price?: number;
  stop_loss_price?: number;
}

const q = (obj: Record<string, string>): string => new URLSearchParams(obj).toString();

/** A simple, always-valid market order body. */
export const marketOrder = (symbol: string, quantity: number, side: 'buy' | 'sell' = 'buy'): PlaceOrder => ({
  instrument_type: 'stock',
  symbol,
  side,
  order_type: 'market',
  quantity,
});

export const placeOrder = (api: SafeApi, token: string, brokerAccountId: string, order: PlaceOrder): Promise<APIResponse> =>
  api.post(`/api/trades?${q({ broker_account_id: brokerAccountId })}`, { token, data: order });

export const getOrder = (api: SafeApi, token: string, orderId: string): Promise<APIResponse> =>
  api.get(`/api/trades/${orderId}`, { token });

export const cancelOrder = (api: SafeApi, token: string, orderId: string): Promise<APIResponse> =>
  api.post(`/api/trades/${orderId}/cancel`, { token });

/** Close a filled position — places the reverse order and fans out to subscribers. */
export const closeOrder = (api: SafeApi, token: string, orderId: string, quantity?: number): Promise<APIResponse> =>
  api.post(`/api/trades/${orderId}/close`, { token, data: quantity === undefined ? {} : { quantity } });
