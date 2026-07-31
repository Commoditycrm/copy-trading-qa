"""QA controllable mock brokerage — TEST-ONLY, local-qa only.

A tiny stdlib HTTP service that lets each test configure deterministic broker behavior per account /
per order, and records call/order/event history for assertions. It never talks to any real brokerage.

Two API surfaces:
  * /admin/*  — configured by the test host (mockBrokerClient.ts): scenarios, latency, history, reset.
  * /broker/* — called by the in-container adapter shim (qa_fake_broker.py) to decide what to return/raise.

State is in-memory, namespaced by run_id, fully resettable. Refuses to start unless APP_ENV=local-qa.

Safety (see also docker-compose.qa.yml):
  1. startup aborts unless APP_ENV=local-qa                        (rule 1)
  2. bound inside the compose net + 127.0.0.1 host mapping only    (rule 2)
  3. accepts no brokerage credentials at all                       (rule 3)
  4. makes zero outbound network calls                            (rule 4)
  5. /admin/reset clears a run's state                            (rule 5)
  6. everything keyed by run_id                                   (rule 6)
  7. logs only method + path, never bodies                        (rule 7)
  8. call/order/event history retained per run for assertions     (rule 8)
"""
import json
import os
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

if os.environ.get("APP_ENV") != "local-qa":
    sys.stderr.write(f"[SAFETY] mock-broker refuses to start: APP_ENV={os.environ.get('APP_ENV')!r} (need 'local-qa')\n")
    sys.exit(3)

PORT = int(os.environ.get("MOCK_BROKER_PORT", "9099"))
_LOCK = threading.RLock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _blank_run():
    return {
        "place": {},      # account_id -> directive {mode, reason, fill}
        "status": {},     # broker_order_id -> {status, filled_quantity, filled_avg_price}
        "cancel": {},     # broker_order_id -> {mode}
        "positions": {},  # account_id -> [positions]
        "latency": {},    # account_id | '__global__' -> ms
        "calls": [],      # {ts, method, account_id, broker_order_id, client_order_id, outcome}
        "orders": [],     # {ts, broker_order_id, client_order_id, account_id, symbol, side, quantity}
        "events": [],     # emitted broker events (for the grey-box driver / assertions)
    }


STATE = {}  # run_id -> run dict


def _run(run_id, create=True):
    r = STATE.get(run_id)
    if r is None and create:
        r = STATE[run_id] = _blank_run()
    return r


def _bod(order_id):
    """Deterministic broker order id from the app order (client_order_id)."""
    return f"mock-{order_id}"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):  # rule 7: no default request-body logging
        pass

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n) or b"{}")

    # ── admin surface (test host) ────────────────────────────────────────
    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read()
        rid = body.get("run_id")
        with _LOCK:
            if path == "/admin/reset":
                STATE.pop(rid, None)
                return self._send(200, {"ok": True, "run_id": rid})
            if path == "/admin/place-result":
                _run(rid)["place"][body["account_id"]] = {
                    "mode": body.get("mode", "success"),
                    "reason": body.get("reason"),
                    "fill": body.get("fill"),  # optional {status, filled_quantity, filled_avg_price}
                }
                return self._send(200, {"ok": True})
            if path == "/admin/order-status":
                _run(rid)["status"][_bod(body["order_id"])] = {
                    "status": body["status"],
                    "filled_quantity": body.get("filled_quantity"),
                    "filled_avg_price": body.get("filled_avg_price"),
                }
                return self._send(200, {"ok": True})
            if path == "/admin/fill":
                fq = body.get("filled_quantity")
                st = body.get("status") or "filled"
                _run(rid)["status"][_bod(body["order_id"])] = {
                    "status": st,
                    "filled_quantity": fq,
                    "filled_avg_price": body.get("filled_avg_price"),
                }
                return self._send(200, {"ok": True})
            if path == "/admin/position":
                _run(rid)["positions"][body["account_id"]] = body.get("positions", [])
                return self._send(200, {"ok": True})
            if path == "/admin/cancel-result":
                _run(rid)["cancel"][_bod(body["order_id"])] = {"mode": body.get("mode", "success")}
                return self._send(200, {"ok": True})
            if path == "/admin/latency":
                _run(rid)["latency"][body.get("account_id") or "__global__"] = int(body.get("ms", 0))
                return self._send(200, {"ok": True})
            if path == "/admin/rate-limit":
                _run(rid)["place"][body["account_id"]] = {"mode": "ratelimit", "reason": body.get("reason")}
                return self._send(200, {"ok": True})
            if path == "/admin/event":
                _run(rid)["events"].append({"ts": _now(), **body.get("event", {})})
                return self._send(200, {"ok": True})

            # ── broker surface (in-container shim) ───────────────────────
            if path == "/broker/place":
                return self._broker_place(rid, body)
            if path == "/broker/cancel":
                return self._broker_cancel(rid, body)
        return self._send(404, {"error": "unknown", "path": path})

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        rid = q.get("run_id")
        with _LOCK:
            if u.path == "/admin/call-history":
                r = _run(rid, create=False) or _blank_run()
                calls = r["calls"]
                if q.get("account_id"):
                    calls = [c for c in calls if c.get("account_id") == q["account_id"]]
                return self._send(200, {"calls": calls})
            if u.path == "/admin/order-history":
                r = _run(rid, create=False) or _blank_run()
                orders = r["orders"]
                if q.get("account_id"):
                    orders = [o for o in orders if o.get("account_id") == q["account_id"]]
                return self._send(200, {"orders": orders})
            if u.path == "/admin/events":
                r = _run(rid, create=False) or _blank_run()
                return self._send(200, {"events": r["events"]})
            if u.path == "/health":
                return self._send(200, {"ok": True})
            if u.path == "/broker/order":
                return self._broker_get(rid, q)
            if u.path == "/broker/positions":
                return self._broker_positions(rid, q)
        return self._send(404, {"error": "unknown", "path": u.path})

    # ── broker decision logic ────────────────────────────────────────────
    def _broker_place(self, rid, body):
        r = _run(rid)
        acct = body.get("account_id")
        coid = body.get("client_order_id")
        bod = _bod(coid) if coid else f"mock-{body.get('nonce', 'x')}"
        directive = r["place"].get(acct, {"mode": "success"})
        mode = directive.get("mode", "success")
        latency = r["latency"].get(acct, r["latency"].get("__global__", 0))
        call = {"ts": _now(), "method": "place", "account_id": acct, "broker_order_id": bod,
                "client_order_id": coid, "outcome": mode, "latency_ms": latency}
        r["calls"].append(call)
        if mode != "success":
            return self._send(200, {"action": "raise", "error_kind": mode, "reason": directive.get("reason"),
                                    "latency_ms": latency})
        r["orders"].append({"ts": _now(), "broker_order_id": bod, "client_order_id": coid,
                            "account_id": acct, "symbol": body.get("symbol"), "side": body.get("side"),
                            "quantity": body.get("quantity")})
        fill = directive.get("fill") or {}
        return self._send(200, {"action": "ok", "broker_order_id": bod,
                                "status": fill.get("status", "submitted"),
                                "filled_quantity": fill.get("filled_quantity", "0"),
                                "filled_avg_price": fill.get("filled_avg_price"),
                                "latency_ms": latency})

    def _broker_get(self, rid, q):
        r = _run(rid)
        bod = q.get("broker_order_id")
        r["calls"].append({"ts": _now(), "method": "get_order", "account_id": q.get("account_id"),
                           "broker_order_id": bod, "outcome": "ok"})
        cfg = r["status"].get(bod)
        if cfg is None:  # default: matches the legacy fake (always filled qty1 @100)
            return self._send(200, {"status": "filled", "filled_quantity": "1", "filled_avg_price": "100.00"})
        return self._send(200, {"status": cfg["status"],
                                "filled_quantity": cfg.get("filled_quantity") or "0",
                                "filled_avg_price": cfg.get("filled_avg_price")})

    def _broker_cancel(self, rid, body):
        r = _run(rid)
        bod = body.get("broker_order_id")
        cfg = r["cancel"].get(bod, {"mode": "success"})
        mode = cfg.get("mode", "success")
        r["calls"].append({"ts": _now(), "method": "cancel", "account_id": body.get("account_id"),
                           "broker_order_id": bod, "outcome": mode})
        if mode == "fail":
            return self._send(200, {"action": "raise", "reason": "cancel rejected by broker"})
        return self._send(200, {"action": "ok", "result": mode != "already_terminal"})

    def _broker_positions(self, rid, q):
        r = _run(rid)
        acct = q.get("account_id")
        r["calls"].append({"ts": _now(), "method": "get_positions", "account_id": acct, "outcome": "ok"})
        return self._send(200, {"positions": r["positions"].get(acct, [])})


def main():
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    sys.stderr.write(f"[mock-broker] listening on :{PORT} (APP_ENV=local-qa)\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
