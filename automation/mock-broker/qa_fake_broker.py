"""QA drop-in for app/brokers/fake.py — mounted OVER the bundled fake adapter inside the disposable
local-qa container ONLY (docker-compose.qa.yml bind mount). The app repo on disk is never modified.

Exposes `FakeBrokerAdapter` (the sole name app/brokers/__init__.py imports) with the exact BrokerAdapter
contract, but delegates each call to the QA mock-broker service so tests can drive deterministic
lifecycle behavior. Errors are RAISED with message substrings the app's classify_error/
is_order_conflict_error key on (adapters signal failure by raising, never by returning status=rejected).

If the mock service is unreachable, it falls back to the legacy fake behavior (submitted / filled qty1
@100 / cancel True / no positions) so non-trading suites still run.
"""
import json
import os
import time
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.brokers.base import (
    BrokerAdapter, BrokerOrderRequest, BrokerOrderResult, BrokerPosition, ConnectionInfo,
)
from app.models.order import OrderStatus, InstrumentType, OptionRight

_URL = os.environ.get("MOCK_BROKER_URL", "http://mock-broker:9099")
_TIMEOUT_S = 10


class Timeout(Exception):
    """Class name is in the app's transient set — used for the timeout scenario."""


def _now():
    return datetime.now(timezone.utc)


def _http(method, path, body=None, query=""):
    url = f"{_URL}{path}{query}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
        return json.loads(resp.read() or b"{}")


def _dec(v):
    return None if v is None else Decimal(str(v))


def _raise_for(kind, reason):
    """Map a scenario mode to an exception whose message/type the app classifies correctly."""
    if kind == "timeout":
        raise Timeout(reason or "broker request timed out")
    if kind == "transient":
        raise Exception(reason or "HTTP 503 service unavailable")  # noqa: TRY002
    if kind == "ratelimit":
        raise Exception(reason or "HTTP 429 too many requests")  # noqa: TRY002
    if kind == "permanent":
        raise Exception(reason or "insufficient buying power for this order")  # noqa: TRY002
    if kind == "conflict":
        raise Exception(reason or "wash trade: insufficient qty available (held_for_orders)")  # noqa: TRY002
    # generic reject → not transient, not user-fixable → app persists REJECTED
    raise Exception(reason or "order rejected by broker")  # noqa: TRY002


_STATUS = {s.value: s for s in OrderStatus}


class FakeBrokerAdapter(BrokerAdapter):
    name = "fake"

    def __init__(self, credentials: dict):
        super().__init__(credentials)
        creds = credentials or {}
        self._run = creds.get("qa_run_id")
        self._acct = creds.get("qa_account_id")

    def verify_connection(self) -> ConnectionInfo:
        return ConnectionInfo(
            broker_account_id=self._acct or f"fake-{uuid.uuid4().hex[:8]}",
            supports_fractional=True,
            extra={"mocked": True},
        )

    def place_order(self, req: BrokerOrderRequest) -> BrokerOrderResult:
        coid = req.client_order_id or str(uuid.uuid4())
        try:
            r = _http("POST", "/broker/place", {
                "run_id": self._run, "account_id": self._acct, "client_order_id": coid,
                "symbol": req.symbol, "side": getattr(req.side, "value", str(req.side)),
                "quantity": str(req.quantity), "nonce": uuid.uuid4().hex,
            })
        except (urllib.error.URLError, OSError):
            return self._legacy_place()
        if r.get("latency_ms"):
            time.sleep(int(r["latency_ms"]) / 1000)
        if r.get("action") == "raise":
            _raise_for(r.get("error_kind", "reject"), r.get("reason"))
        return BrokerOrderResult(
            broker_order_id=r["broker_order_id"],
            status=_STATUS.get(r.get("status", "submitted"), OrderStatus.SUBMITTED),
            submitted_at=_now(),
            filled_quantity=_dec(r.get("filled_quantity")) or Decimal(0),
            filled_avg_price=_dec(r.get("filled_avg_price")),
        )

    def get_order(self, broker_order_id: str) -> BrokerOrderResult:
        try:
            r = _http("GET", "/broker/order",
                      query=f"?run_id={self._run}&account_id={self._acct}&broker_order_id={broker_order_id}")
        except (urllib.error.URLError, OSError):
            r = {"status": "filled", "filled_quantity": "1", "filled_avg_price": "100.00"}
        return BrokerOrderResult(
            broker_order_id=broker_order_id,
            status=_STATUS.get(r.get("status", "filled"), OrderStatus.FILLED),
            submitted_at=_now(),
            filled_quantity=_dec(r.get("filled_quantity")) or Decimal(0),
            filled_avg_price=_dec(r.get("filled_avg_price")),
        )

    def cancel_order(self, broker_order_id: str) -> bool:
        try:
            r = _http("POST", "/broker/cancel",
                      {"run_id": self._run, "account_id": self._acct, "broker_order_id": broker_order_id})
        except (urllib.error.URLError, OSError):
            return True
        if r.get("action") == "raise":
            raise Exception(r.get("reason") or "cancel failed")  # noqa: TRY002
        return bool(r.get("result", True))

    def get_positions(self) -> list[BrokerPosition]:
        try:
            r = _http("GET", "/broker/positions", query=f"?run_id={self._run}&account_id={self._acct}")
        except (urllib.error.URLError, OSError):
            return []
        out = []
        for p in r.get("positions", []):
            out.append(BrokerPosition(
                broker_symbol=p.get("broker_symbol") or p["symbol"],
                symbol=p["symbol"],
                instrument_type=InstrumentType(p.get("instrument_type", "stock")),
                quantity=_dec(p["quantity"]),
                avg_entry_price=_dec(p.get("avg_entry_price")),
                current_price=_dec(p.get("current_price")),
                market_value=_dec(p.get("market_value")),
                unrealized_pnl=_dec(p.get("unrealized_pnl")),
                cost_basis=_dec(p.get("cost_basis")),
                option_expiry=None,
                option_strike=_dec(p.get("option_strike")),
                option_right=OptionRight(p["option_right"]) if p.get("option_right") else None,
            ))
        return out

    def _legacy_place(self) -> BrokerOrderResult:
        return BrokerOrderResult(
            broker_order_id=f"fake-{uuid.uuid4().hex}",
            status=OrderStatus.SUBMITTED, submitted_at=_now(),
            filled_quantity=Decimal(0), filled_avg_price=None,
        )
