# Fixtures

Reusable test data building blocks. **No real data, no secrets, no real broker responses.**

```
fixtures/
├─ data/        # static reference JSON (expected enum sets, symbol lists, etc.)
├─ factories/   # programmatic builders (Faker-backed) — prefer creating via the public API
└─ mocks/       # recorded/synthetic broker & webhook payload shapes (SnapTrade, OCC symbols, etc.)
```

See `docs/TEST_DATA_STRATEGY.md`. Synthetic identities use `*.kopyya.test`; fake broker only.
