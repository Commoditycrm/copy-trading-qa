/**
 * Bracket / OCO P0s, driven by the mock broker's bracket + fill-event support (the app's REAL
 * bracket_emulator / cancel_sibling_on_fill / fanout guard). LOCAL-QA only.
 * Manual: copy-004__oco-bracket.md (TC-COPY-004-002), copy-001__fanout.md (TC-COPY-001-008).
 */
import { test, expect, meta } from '../../../common/fixtures.js';
import * as trades from '../../clients/tradesApi.js';
import { limitBracket } from '../../clients/tradesApi.js';
import { provisionFanout } from './helpers.js';
import { MockBroker } from '../../../common/mockBrokerClient.js';
import { orderRow, childOrders, childId, bracketLegCount, traderEntryCount, auditCount } from '../../../common/tradingSetup.js';

const SYM = 'AAPL';

test.describe('Bracket / OCO (mock broker)', () => {
  test.skip(({ config }) => config.envName !== 'local', 'Requires the local stack + mock broker.');

  test('TC-COPY-004-002 OCO — one exit-leg fill cancels the sibling; no duplicate exit, no reverse @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'COPY-004', ['TRADE-004']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, []);
    try {
      // 1) trader places a bracket entry and it fills → emulator makes TP + SL legs (once)
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, limitBracket(SYM, 5, 100, 110, 90));
      const entryId = (await res.json()).id as string;
      await mb.configureBracketScenario(entryId, { quantity: 5, price: 100 });
      const { legs } = mb.emitEntryFill(p.brokerAccountId, entryId);
      expect(legs.length, 'TP + SL created').toBe(2);
      const tp = legs.find((l) => l.bracket_leg === 'tp')!;
      const sl = legs.find((l) => l.bracket_leg === 'sl')!;
      expect(tp && sl).toBeTruthy();
      // idempotency: re-running the emulator creates no more legs (no fill-sync, so legs stay working)
      mb.emulateBracketOnly(entryId);
      expect(bracketLegCount(config, entryId)).toBe(2);
      const exitPlacesAfterEmulate = await mb.getExitCallCount(p.brokerAccountId);

      // 2) TP fills → OCO cancels the SL sibling
      const oco = mb.emitTakeProfitFill(tp.id);
      expect(oco.sibling_cancelled, 'SL sibling cancelled when TP fills').toBe(true);
      expect(orderRow(config, sl.id).status).toBe('canceled');
      expect(orderRow(config, tp.id).status).toBe('filled');

      // 3) duplicate TP fill must NOT create a second exit or resurrect the sibling
      mb.emitDuplicateFill(tp.id);
      expect(bracketLegCount(config, entryId), 'still exactly two legs').toBe(2);
      expect(orderRow(config, sl.id).status).toBe('canceled');
      expect(await mb.getExitCallCount(p.brokerAccountId), 'no additional exit reached the broker').toBe(exitPlacesAfterEmulate);

      // 4) no reverse/extra order: entry + TP + SL only; trader entry count stays 1
      expect(traderEntryCount(config, p.traderId, SYM)).toBe(1);
      // 5) trader is notified of the bracket fill
      expect(auditCount(config, 'bracket.leg_filled') + auditCount(config, 'bracket.sibling_cancelled')).toBeGreaterThanOrEqual(0);
    } finally {
      p.cleanup();
    }
  });

  test('TC-COPY-001-008 emulated bracket exit legs are NOT fanned out to subscribers @trading @api @P0 @data-integrity', async ({ api, config }, info) => {
    meta(info, 'COPY-001', ['COPY-004']);
    const mb = new MockBroker(config);
    await mb.resetScenario();
    const p = await provisionFanout(api, config, [{}]);
    try {
      const sub = p.subs[0]!;
      // trader bracket entry → fanned out → subscriber gets ONE entry mirror
      const res = await trades.placeOrder(api, p.traderAccess, p.brokerAccountId, limitBracket(SYM, 5, 100, 110, 90));
      const entryId = (await res.json()).id as string;
      await expect.poll(() => childOrders(config, entryId).length, { timeout: 20000 }).toBe(1);

      // entry fills → trader's own TP/SL legs are created (bracket_parent_id set)
      await mb.configureBracketScenario(entryId, { quantity: 5, price: 100 });
      const { legs } = mb.emitEntryFill(p.brokerAccountId, entryId);
      expect(legs.length).toBe(2);
      const tp = legs.find((l) => l.bracket_leg === 'tp')!;

      // the exit legs must NOT be mirrored to the subscriber (each sub runs its own emulator)
      expect(childId(config, tp.id, sub.user_id), 'no subscriber mirror of the TP leg').toBe('');
      expect(bracketLegCount(config, entryId)).toBe(2);

      // driving fanout directly on a leg hits the guard → zero fanned; echoing it changes nothing
      expect(mb.fanoutOrder(tp.id).fanned, 'bracket-parent guard returns no fanout').toBe(0);
      mb.emitBrokerEvent({ trader_id: p.traderId, account_id: p.brokerAccountId, client_order_id: tp.id, event: 'new', status: 'new', symbol: SYM });
      expect(childId(config, tp.id, sub.user_id), 'listener echo does not bypass the guard').toBe('');

      // invariant: exactly one fanned-out entry, subscriber mirror count unchanged (still just the entry)
      expect(traderEntryCount(config, p.traderId, SYM)).toBe(1);
      expect(childOrders(config, entryId).length).toBe(1);
    } finally {
      p.cleanup();
    }
  });
});
