# Tools

Helper scripts for QA operations (added after approval). Planned:

- `stand_up_local_qa.*` — bring up a disposable local QA stack from the app's compose with fake broker
  + QA-only env (never modifies the app repo; env file lives outside it).
- `seed_fake_subscribers.*` — call the app admin load-test API to seed/cleanup fake subscribers.
- `mint_test_jwt.*` — mint QA-only JWTs for authZ negative tests.
- `fetch_openapi.*` — pull `/openapi.json` from the target env to regenerate the authoritative endpoint
  list (reconciles VERIFICATION_NOTES VN-01).

All tools operate over HTTP or against the QA env only — never SSH into servers for test execution,
never touch the app repo, never handle prod secrets.
