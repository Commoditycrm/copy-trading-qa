# QA Controllable Mock Broker (local-qa only)

A **test-only** brokerage double that lets each test drive deterministic broker behavior. It is a QA-side
asset — the application repo is never modified. See `docs/MOCK_BROKER_AND_UNLOCKED_TRADING.md` for the
full architecture and safety controls.

## Pieces
- **`server.py`** — stdlib HTTP service (its own container). `/admin/*` = test control + history;
  `/broker/*` = what the in-container shim asks. In-memory, per-`run_id`, resettable. Refuses to start
  unless `APP_ENV=local-qa`.
- **`qa_fake_broker.py`** — drop-in `FakeBrokerAdapter`, bind-mounted **over** `app/brokers/fake.py`
  inside the disposable container only (compose `volumes:`). Matches the real `BrokerAdapter` contract
  and **raises** message-classified exceptions so the app's error classification runs for real.
- **`driver.py`** — grey-box: runs the app's own `fills_sync` / `retry_scheduler` / `trade_listener`
  with the controllable adapter (fake accounts get no listener / no Alpaca fill-sync natively).

## Use it from a test
```ts
import { MockBroker } from '../../../common/mockBrokerClient.js';
const mb = new MockBroker(config);
await mb.resetScenario();
await mb.setPlaceOrderResult(brokerAccountId, 'transient');   // reject|permanent|timeout|ratelimit|conflict
await mb.setOrderStatus(orderId, 'partially_filled', 3, 100); // then mb.syncFills(accountId)
await mb.setPosition(accountId, [{ symbol: 'AAPL', quantity: 5 }]);
await mb.setCancelResult(orderId, 'fail');
const n = await mb.callCount('place', brokerAccountId);       // broker-call-count assertions
mb.emitBrokerEvent({ trader_id, account_id, client_order_id, event: 'new', status: 'new' });
```

## Notes
- Keying: place/positions by **account id**; order-status/cancel/fill by **order id**
  (`broker_order_id = mock-<order id>`). All configured **before** the app calls the broker.
- Default (unconfigured) behavior mirrors the legacy fake (submitted / filled qty1 @100 / cancel true /
  no positions), so Batch-1 and non-trading suites are unaffected.
- Trading tests run `--workers=1` (docker-exec seeding + close-fanout load on the single web worker).
