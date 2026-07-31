"""QA-ONLY trading fixture seed — executed INSIDE the backend container against the
disposable LOCAL stack. It attaches fake (test-only) broker accounts and sets follow/
copy state so a trader order fans out to subscribers, reusing the app's own models,
crypto, and cache-invalidation (identical to backend/scripts/seed_fake_subscribers.py).

It never runs against a real environment: the caller only ever docker-execs this into
the local compose stack, and it refuses any email outside the synthetic QA domain.

Input : SEED_SPEC_B64 env var = base64(json) of
        { "trader_email": "...@qa.kopyya.dev",
          "subscribers": [ {"email","multiplier","copy_enabled","follow","broker"} ] }
Output: one line of JSON on stdout = { trader_id, trader_account_id, subscribers:[...] }
"""
import base64
import json
import os
import uuid
from decimal import Decimal

from sqlalchemy import select

from app.database import SessionLocal
from app.models.user import User
from app.models.broker_account import BrokerAccount, BrokerName
from app.models.settings import TraderSettings, SubscriberSettings, RetryInterval
from app.services.crypto import encrypt_json

SAFE_DOMAIN = "@qa.kopyya.dev"

spec = json.loads(base64.b64decode(os.environ["SEED_SPEC_B64"]))
trader_email = spec["trader_email"]
subs = spec["subscribers"]
run_id = spec.get("run_id")

assert trader_email.endswith(SAFE_DOMAIN), f"unsafe trader email {trader_email!r}"
for s in subs:
    assert s["email"].endswith(SAFE_DOMAIN), f"unsafe subscriber email {s['email']!r}"


def _fake_account(user_id: uuid.UUID, label: str, number: str) -> BrokerAccount:
    acct_id = uuid.uuid4()
    # Embed the QA run + account id in the (app-ignored) fake creds so the mock-broker shim can key
    # deterministic behavior per account. No real brokerage credential is ever stored.
    creds = encrypt_json({"qa_run_id": run_id, "qa_account_id": str(acct_id)})
    return BrokerAccount(
        id=acct_id,
        user_id=user_id,
        broker=BrokerName.FAKE,
        label=label,
        is_paper=True,
        supports_fractional=True,
        encrypted_credentials=creds,
        connection_status="connected",
        broker_account_number=number,
    )


out: dict = {"subscribers": []}
with SessionLocal() as db:
    trader = db.execute(select(User).where(User.email == trader_email)).scalar_one()

    ts = db.execute(
        select(TraderSettings).where(TraderSettings.user_id == trader.id)
    ).scalar_one_or_none()
    if ts is None:
        db.add(TraderSettings(user_id=trader.id, trading_enabled=True, copy_paused=False))
    else:
        ts.trading_enabled = True
        ts.copy_paused = False

    tacct = db.execute(
        select(BrokerAccount).where(
            BrokerAccount.user_id == trader.id, BrokerAccount.broker == BrokerName.FAKE
        )
    ).scalar_one_or_none()
    if tacct is None:
        tacct = _fake_account(trader.id, "QA Fake Trader", "QA-FAKE-TRADER")
        db.add(tacct)
        db.flush()
    out["trader_id"] = str(trader.id)
    out["trader_account_id"] = str(tacct.id)

    for s in subs:
        sub = db.execute(select(User).where(User.email == s["email"])).scalar_one()
        ss = db.execute(
            select(SubscriberSettings).where(SubscriberSettings.user_id == sub.id)
        ).scalar_one_or_none()
        if ss is None:
            ss = SubscriberSettings(user_id=sub.id)
            db.add(ss)
        ss.following_trader_id = trader.id if s.get("follow", True) else None
        ss.copy_enabled = bool(s.get("copy_enabled", True))
        ss.multiplier = Decimal(str(s.get("multiplier", "1")))
        if s.get("retry_open"):
            ss.retry_interval_open = RetryInterval(s["retry_open"])
        if s.get("retry_close"):
            ss.retry_interval_close = RetryInterval(s["retry_close"])
        if s.get("retry_max_attempts") is not None:
            ss.retry_max_attempts = int(s["retry_max_attempts"])
        if s.get("symbol_exclusion") is not None:
            ss.symbol_exclusion_list = list(s["symbol_exclusion"])
        if s.get("symbol_inclusion") is not None:
            ss.symbol_inclusion_list = list(s["symbol_inclusion"])

        acct_id = None
        if s.get("broker", True):
            sacct = db.execute(
                select(BrokerAccount).where(
                    BrokerAccount.user_id == sub.id,
                    BrokerAccount.broker == BrokerName.FAKE,
                )
            ).scalar_one_or_none()
            if sacct is None:
                sacct = _fake_account(sub.id, "QA Fake Sub", f"QA-FAKE-SUB-{sub.id.hex[:6]}")
                db.add(sacct)
                db.flush()
            acct_id = str(sacct.id)

        out["subscribers"].append(
            {"email": s["email"], "user_id": str(sub.id), "account_id": acct_id}
        )

    db.commit()
    try:
        from app.services import cache as cache_svc
        cache_svc.invalidate_subscribers_for_trader(trader.id)
    except Exception:  # best-effort; TTL will catch up otherwise
        pass

print(json.dumps(out))
