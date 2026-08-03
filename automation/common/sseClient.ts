/**
 * Real local SSE consumer for the QA suite. Connects to GET /api/events?token=<jwt> (text/event-stream)
 * and parses SSE frames, collecting `data:` JSON events and raw comment lines (`: connected`, `: heartbeat`).
 * No fixed sleeps — callers use `waitFor(pred)` which bounded-polls the collected buffer. Correlate test
 * events by an injected `run_id` field.
 */
import type { QaConfig } from './config.js';

export interface SseConn {
  events: Array<Record<string, any>>;
  raw: string[];
  close: () => void;
  waitFor: (pred: (e: Record<string, any>) => boolean, timeoutMs?: number) => Promise<Record<string, any> | null>;
  waitForRaw: (pred: (line: string) => boolean, timeoutMs?: number) => Promise<string | null>;
  count: () => number;
}

/** Open an SSE stream. Throws `SSE <status>` if the connection is rejected (401 etc.). */
export async function openSse(config: QaConfig, token: string): Promise<SseConn> {
  const ctrl = new AbortController();
  const res = await fetch(`${config.apiBaseUrl}/api/events?token=${encodeURIComponent(token)}`, {
    signal: ctrl.signal,
    headers: { Accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) {
    ctrl.abort();
    throw new Error(`SSE ${res.status}`);
  }
  const events: Array<Record<string, any>> = [];
  const raw: string[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          raw.push(frame);
          for (const line of frame.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                events.push(JSON.parse(line.slice(5).trim()));
              } catch {
                /* non-JSON data line */
              }
            }
          }
        }
      }
    } catch {
      /* aborted / stream closed */
    }
  })();

  const poll = async <T>(get: () => T | undefined, timeoutMs: number): Promise<T | null> => {
    const start = Date.now();
    for (;;) {
      const hit = get();
      if (hit !== undefined) return hit;
      if (Date.now() - start >= timeoutMs) return null;
      await new Promise((r) => setTimeout(r, 100)); // bounded poll of the buffer, not a fixed test delay
    }
  };

  return {
    events,
    raw,
    close: () => ctrl.abort(),
    count: () => events.length,
    waitFor: (pred, timeoutMs = 15000) => poll(() => events.find(pred), timeoutMs),
    waitForRaw: (pred, timeoutMs = 25000) => poll(() => raw.find(pred), timeoutMs),
  };
}

/** Fetch the SSE endpoint and return only the HTTP status (for auth-rejection cases). */
export async function sseStatus(config: QaConfig, token: string): Promise<number> {
  const ctrl = new AbortController();
  try {
    const res = await fetch(`${config.apiBaseUrl}/api/events?token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
      headers: { Accept: 'text/event-stream' },
    });
    const status = res.status;
    ctrl.abort();
    return status;
  } catch {
    return 0;
  }
}
