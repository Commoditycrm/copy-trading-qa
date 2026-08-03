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

elif action == "emulate_bracket":
    # Fill the entry, then run the app's real bracket emulator → TP/SL exit legs.
    from app.services import bracket_emulator
    from app.models.order import OrderStatus
    with SessionLocal() as db:
        entry = db.get(Order, uuid.UUID(spec["entry_order_id"]))
        legs = bracket_emulator.emulate_bracket_exits(db, entry)
        db.commit()
        out["legs"] = [{"id": str(l.id), "bracket_leg": l.bracket_leg, "status": l.status.value,
                        "parent": str(l.bracket_parent_id) if l.bracket_parent_id else None}
                       for l in legs]

elif action == "fill_leg_oco":
    # Mark one bracket leg FILLED and run the OCO sibling-cancel.
    from app.services import bracket_emulator
    from app.models.order import OrderStatus
    with SessionLocal() as db:
        leg = db.get(Order, uuid.UUID(spec["leg_order_id"]))
        leg.status = OrderStatus.FILLED
        leg.filled_quantity = leg.quantity
        leg.filled_avg_price = leg.limit_price or leg.stop_price
        db.flush()
        canceled = bracket_emulator.cancel_sibling_on_fill(db, leg)
        db.commit()
        rows = db.query(Order).filter(Order.bracket_parent_id == leg.bracket_parent_id).all()
        out["sibling_cancelled"] = bool(canceled)
        out["legs"] = [{"id": str(o.id), "bracket_leg": o.bracket_leg, "status": o.status.value} for o in rows]

elif action == "fanout_order":
    # Drive the app's real fanout on one order — exercises the bracket-parent guard.
    import asyncio
    from app.services import copy_engine
    from app.models.user import User
    with SessionLocal() as db:
        order = db.get(Order, uuid.UUID(spec["order_id"]))
        trader = db.get(User, order.user_id)
        results = asyncio.run(copy_engine.fanout_async(db, order, trader))
        db.commit()
        out["fanned"] = len(results) if results else 0

elif action == "seed_pnl":
    # Seed today's FIFO-realized P&L for a subscriber via a matched BUY→SELL pair of filled orders
    # (no Fill rows needed — today_realized_pnl_bulk falls back to Order.filled_quantity/avg_price).
    from datetime import timedelta
    from decimal import Decimal
    from app.models.order import Order, OrderStatus, OrderSide, OrderType, InstrumentType
    uid = uuid.UUID(spec["user_id"]); acct = uuid.UUID(spec["account_id"])
    qty = Decimal(str(spec["quantity"])); buy = Decimal(str(spec["buy_price"])); sell = Decimal(str(spec["sell_price"]))
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        def _o(side, price, when):
            return Order(id=uuid.uuid4(), user_id=uid, broker_account_id=acct,
                         instrument_type=InstrumentType.STOCK, symbol=spec.get("symbol", "PNLX"),
                         side=side, order_type=OrderType.MARKET, quantity=qty,
                         filled_quantity=qty, filled_avg_price=price, status=OrderStatus.FILLED,
                         broker_order_id=f"seed-{uuid.uuid4().hex[:8]}", submitted_at=when, closed_at=when)
        db.add(_o(OrderSide.BUY, buy, now - timedelta(minutes=2)))
        db.add(_o(OrderSide.SELL, sell, now - timedelta(minutes=1)))
        db.commit()
    out["seeded_pnl"] = str((sell - buy) * qty)

elif action == "enforce_tp_sl":
    # Run the app's real per-position TP/SL enforcer using the mock adapter's positions.
    from app.services import position_enforcer
    with SessionLocal() as db:
        closed = position_enforcer.enforce_position_tp_sl(db, uuid.UUID(spec["user_id"]), uuid.UUID(spec["account_id"]))
        db.commit()
        out["closed"] = [str(c) for c in (closed or [])]
        out["closed_count"] = len(closed or [])

elif action == "poller_enforce":
    # Run the app's real per-subscriber poller tick (auto-resume + daily kill-switches + auto-liquidation).
    from app.services import pnl_poller
    from app.models.broker_account import BrokerAccount
    with SessionLocal() as db:
        acct = db.get(BrokerAccount, uuid.UUID(spec["account_id"]))
        db.expunge(acct)
    pnl_poller._enforce_one(acct)  # opens its own session
    with SessionLocal() as db:
        from app.models.settings import SubscriberSettings
        ss = db.get(SubscriberSettings, acct.user_id)
        out["copy_enabled"] = bool(ss.copy_enabled) if ss else None
        out["auto_liquidated"] = ss.auto_liquidated_at is not None if ss else None

elif action == "poller_pass":
    # One poll pass over several accounts via the app's crash-isolation wrapper (_enforce_one_safe),
    # so one account's failure cannot stop the others. Returns each account's resulting state.
    from app.services import pnl_poller
    from app.models.broker_account import BrokerAccount
    from app.models.settings import SubscriberSettings
    ids = [uuid.UUID(a) for a in spec["account_ids"]]
    accts = []
    with SessionLocal() as db:
        for aid in ids:
            a = db.get(BrokerAccount, aid)
            db.expunge(a)
            accts.append(a)
    for a in accts:
        pnl_poller._enforce_one_safe(a)  # swallows per-account exceptions internally
    res = {}
    with SessionLocal() as db:
        for a in accts:
            ss = db.get(SubscriberSettings, a.user_id)
            res[str(a.id)] = {"copy_enabled": bool(ss.copy_enabled) if ss else None,
                              "auto_liquidated": (ss.auto_liquidated_at is not None) if ss else None,
                              "paused": (ss.pnl_auto_paused_at is not None) if ss else None}
    out["accounts"] = res

elif action == "recovery_sweep":
    # Worker-boot crash recovery: replay orphaned PENDING child orders (idempotent client_order_id).
    import asyncio
    from app.services import recovery
    n = asyncio.run(recovery.sweep_orphaned_pending())
    out["recovered"] = n

elif action == "seed_pending_child":
    # Seed a PENDING mirror child old enough (created_at < now-60s) for recovery to replay.
    from datetime import timedelta
    from decimal import Decimal
    from app.models.order import Order, OrderStatus, OrderSide, OrderType, InstrumentType
    puid = uuid.UUID(spec["user_id"]); pacct = uuid.UUID(spec["account_id"]); parent = uuid.UUID(spec["parent_order_id"])
    old = datetime.now(timezone.utc) - timedelta(seconds=120)
    with SessionLocal() as db:
        child = Order(id=uuid.uuid4(), user_id=puid, broker_account_id=pacct, parent_order_id=parent,
                      instrument_type=InstrumentType.STOCK, symbol=spec.get("symbol", "AAPL"),
                      side=OrderSide.BUY, order_type=OrderType.MARKET, quantity=Decimal(str(spec.get("quantity", 5))),
                      status=OrderStatus.PENDING, broker_order_id=None, created_at=old, submitted_at=old)
        db.add(child); db.commit()
        out["child_id"] = str(child.id)

elif action == "day_start_equity":
    from datetime import date
    from decimal import Decimal
    from app.services import day_start_equity
    acct = uuid.UUID(spec["account_id"]); eq = Decimal(str(spec["equity"]))
    ud = date.fromisoformat(spec["utc_date"]) if spec.get("utc_date") else None
    with SessionLocal() as db:
        val = day_start_equity.get_or_record(db, acct, eq, utc_date=ud)
        db.commit()
        n = db.execute(__import__("sqlalchemy").text(
            "SELECT count(*) FROM daily_equity_snapshots WHERE broker_account_id=:a"), {"a": acct}).scalar()
        out["value"] = str(val); out["rows"] = int(n)

elif action == "reconcile_position":
    from app.services import position_reconciler
    from app.models.broker_account import BrokerAccount
    with SessionLocal() as db:
        acct = db.get(BrokerAccount, uuid.UUID(spec["account_id"]))
        report = position_reconciler.reconcile_account(db, acct, apply=bool(spec.get("apply")))
        db.commit()
        n = db.execute(__import__("sqlalchemy").text(
            "SELECT count(*) FROM orders WHERE broker_account_id=:a AND broker_order_id LIKE 'RECONCILE:%'"),
            {"a": acct.id}).scalar()
        out["synthetic_closes"] = int(n)

elif action == "retry_heartbeat":
    from app.services import retry_scheduler
    out["heartbeat"] = retry_scheduler.heartbeat_status()

elif action == "create_notif":
    from app.services import notifications
    with SessionLocal() as db:
        notifications.create_notification(db, user_id=uuid.UUID(spec["user_id"]),
                                          type=spec.get("type", "test.note"), message=spec.get("message", "hi"))
        db.commit()
    out["created"] = True

elif action == "eod_tick":
    # QA-side injectable clock: rebind market_hours.now_et for THIS process only (no app edit), then tick.
    import asyncio
    from app.services import market_hours, eod_autoclose
    from app.config import get_settings
    frozen = datetime.fromisoformat(spec["frozen_et"])
    market_hours.now_et = lambda: frozen  # noqa: E731 — runtime monkeypatch, driver process only
    # Force the global EOD flag on for this process (pydantic settings may be frozen).
    try:
        object.__setattr__(get_settings(), "eod_autoclose_enabled", True)
    except Exception:
        pass
    try:
        eod_autoclose._last_swept.clear()
    except Exception:
        pass
    asyncio.run(eod_autoclose._tick())
    out["ticked"] = True

elif action == "emit_sse":
    # Publish one or many correlated SSE events onto the user's channel (events:user:<uid>) in one call.
    from app.services import events
    uid = uuid.UUID(spec["user_id"])
    batch = spec.get("events")
    if batch is not None:
        for ev in batch:
            events.publish(uid, ev)
        out["published"] = len(batch)
    else:
        events.publish(uid, spec.get("event", {}))
        out["published"] = 1

elif action == "warm_subs_cache":
    import asyncio
    from app.services import cache as cache_svc
    with SessionLocal() as db:
        asyncio.run(cache_svc.get_subscribers_for_trader(db, uuid.UUID(spec["trader_id"])))
    out["warmed"] = True

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
