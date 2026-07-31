"""QA grey-box driver — executed INSIDE the backend container (local-qa only). Invokes the app's OWN
lifecycle logic (fills-sync, retry scheduler, broker-event listener) using the controllable fake
adapter, so tests can drive fill-sync / retry / listener-echo deterministically. Reads a base64 JSON
spec from DRIVER_SPEC_B64; prints one JSON result line.

The app repo is not modified — this only *calls* app functions the same way the running services do.
"""
import base64
import json
import os
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.database import SessionLocal
from app.models.broker_account import BrokerAccount
from app.models.order import Order
from app.brokers import adapter_for
from app.services.crypto import decrypt_json

spec = json.loads(base64.b64decode(os.environ["DRIVER_SPEC_B64"]))
action = spec["action"]
out = {"action": action}


def _adapter_for_account(db, account_id):
    acct = db.get(BrokerAccount, uuid.UUID(account_id))
    creds = decrypt_json(acct.encrypted_credentials)
    return acct, adapter_for(acct, creds)


if action == "refresh_fills":
    from app.services import fills_sync
    with SessionLocal() as db:
        acct, adapter = _adapter_for_account(db, spec["account_id"])
        n = fills_sync._refresh_open_orders(db, acct, adapter)
        db.commit()
        rows = db.query(Order).filter(Order.broker_account_id == acct.id).all()
        out["refreshed"] = n
        out["orders"] = [{"id": str(o.id), "status": o.status.value,
                          "filled_quantity": str(o.filled_quantity),
                          "filled_avg_price": None if o.filled_avg_price is None else str(o.filled_avg_price)}
                         for o in rows]

elif action == "run_retry":
    from app.services import retry_scheduler
    outcome = retry_scheduler._retry_one_order(uuid.UUID(spec["order_id"]))
    with SessionLocal() as db:
        o = db.get(Order, uuid.UUID(spec["order_id"]))
        out["outcome"] = outcome
        if o is not None:
            out["order"] = {"id": str(o.id), "status": o.status.value, "is_closing": bool(o.is_closing),
                            "retry_count": o.retry_count}

elif action == "emit_event":
    from app.services import trade_listener
    coid = spec.get("client_order_id") or spec.get("order_id")
    bod = spec.get("broker_order_id") or (f"mock-{coid}" if coid else None)
    submitted = spec.get("submitted_at")
    submitted_dt = datetime.fromisoformat(submitted) if submitted else datetime.now(timezone.utc)
    order_obj = SimpleNamespace(
        id=bod,
        client_order_id=str(coid) if coid else None,
        status=spec.get("status", "new"),
        symbol=spec.get("symbol", "AAPL"),
        side=spec.get("side", "buy"),
        qty=str(spec.get("quantity", "1")),
        filled_qty=str(spec.get("filled_quantity", "0")),
        filled_avg_price=spec.get("filled_avg_price"),
        submitted_at=submitted_dt,
        limit_price=None,
        stop_price=None,
        asset_class=spec.get("asset_class", "us_equity"),
    )
    update = SimpleNamespace(event=SimpleNamespace(value=spec.get("event", "new")), order=order_obj)
    trade_listener._persist_and_fanout(
        uuid.UUID(spec["trader_id"]), uuid.UUID(spec["account_id"]), update, datetime.now(timezone.utc),
    )
    out["emitted"] = True

else:
    out["error"] = f"unknown action {action!r}"

print(json.dumps(out))
