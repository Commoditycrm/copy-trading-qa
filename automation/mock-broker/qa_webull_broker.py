"""QA drop-in for app/brokers/webull.py — mounted OVER the real direct-Webull adapter inside the
disposable local-qa container ONLY (docker-compose.webull.yml bind mount), and ONLY for the
webull-connect test pass. The app repo on disk is never modified.

Purpose: exercise the direct-Webull CONNECT path (verify_connection → persist → Fernet-encrypt →
disconnect) without the real `webull-openapi-python-sdk`, real credentials, or any network. It imports
NO webull SDK (so it can never re-introduce the compromised import-time behaviour) and delegates nothing
outbound — every method returns deterministic canned data.

Controllable failure: if `app_key` starts with "FAILVERIFY" (or `_qa_fail_verify` is set), verify_connection
raises — used by the verify-failure test to prove a bad connection is NOT persisted.

Exposes `WebullAdapter` (the sole name app/brokers/__init__.py imports for BrokerName.WEBULL) with the exact
BrokerAdapter contract. Writes stay unimplemented (identical to the real adapter — direct Webull is
read/stream only; subscriber execution runs through SnapTrade).
"""
from decimal import Decimal
from typing import Any

from app.brokers.base import (
    BrokerAdapter,
    BrokerOrderRequest,
    BrokerOrderResult,
    BrokerPosition,
    ConnectionInfo,
)


class WebullAdapter(BrokerAdapter):
    name = "webull"

    def __init__(self, credentials: dict[str, Any]):
        super().__init__(credentials)
        self.credentials = credentials or {}
        self.account_id = str(self.credentials.get("account_id", "")).strip()
        self.app_key = str(self.credentials.get("app_key", "")).strip()

    def verify_connection(self) -> ConnectionInfo:
        # Deterministic failure hook for the "verify fails → not persisted" test.
        if self.app_key.startswith("FAILVERIFY") or self.credentials.get("_qa_fail_verify"):
            raise RuntimeError("webull verify_connection failed: invalid credentials (QA mock)")
        return ConnectionInfo(
            broker_account_id=self.account_id or "wb-mock-acct",
            supports_fractional=False,
            extra={"mock": "webull", "region": self.credentials.get("region_id", "us")},
        )

    def get_balance_snapshot(self) -> dict[str, Any]:
        # Shape matches the real adapter so api.brokers._refresh_balance_into consumes it.
        return {
            "cash": Decimal("10000"),
            "buying_power": Decimal("20000"),
            "total_equity": Decimal("10000"),
            "currency": "USD",
        }

    def get_pnl_snapshot(self) -> dict[str, Any] | None:
        return {
            "todays_pl": Decimal("0"),
            "equity": Decimal("10000"),
            "beginning_day_balance": Decimal("10000"),
        }

    def get_positions(self) -> list[BrokerPosition]:
        return []

    def cancel_order(self, broker_order_id: str) -> bool:
        return True

    # ── writes — NOT wired for direct Webull (identical to the real adapter) ──
    def place_order(self, req: BrokerOrderRequest) -> BrokerOrderResult:
        raise NotImplementedError(
            "QA webull mock: direct-Webull order placement is not wired (subscribers execute via SnapTrade)."
        )

    def get_order(self, broker_order_id: str) -> BrokerOrderResult:
        raise NotImplementedError("QA webull mock: direct-Webull get_order is not wired (stream-driven).")


__all__ = ["WebullAdapter"]
