/**
 * Safe API request wrapper around Playwright's APIRequestContext (the primary
 * black-box API testing surface per the approved decisions). Every mutating
 * request is routed through the production write-block guard first, so a test
 * can never accidentally write to production. Evidence is redacted on capture.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { QaConfig } from './config.js';
import { assertRequestAllowed } from './safety.js';
import { redact, redactHeaders } from './redaction.js';

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  token?: string; // bearer access token
}

function withAuth(opts: RequestOptions): { headers: Record<string, string>; [k: string]: unknown } {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const out: Record<string, unknown> = { headers };
  if (opts.params) out.params = opts.params;
  if (opts.data !== undefined) out.data = opts.data;
  return out as { headers: Record<string, string> };
}

export class SafeApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly config: QaConfig,
  ) {}

  private full(path: string): string {
    return path.startsWith('http') ? path : `${this.config.apiBaseUrl}${path}`;
  }

  async get(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    assertRequestAllowed(this.config, 'GET', path);
    return this.request.get(this.full(path), withAuth(opts));
  }
  async post(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    assertRequestAllowed(this.config, 'POST', path);
    return this.request.post(this.full(path), withAuth(opts));
  }
  async patch(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    assertRequestAllowed(this.config, 'PATCH', path);
    return this.request.patch(this.full(path), withAuth(opts));
  }
  async delete(path: string, opts: RequestOptions = {}): Promise<APIResponse> {
    assertRequestAllowed(this.config, 'DELETE', path);
    return this.request.delete(this.full(path), withAuth(opts));
  }
}

/** Build a redacted evidence object safe to attach to a report. */
export async function evidenceOf(method: string, url: string, res: APIResponse): Promise<string> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return JSON.stringify(
    { request: { method, url }, response: { status: res.status(), headers: redactHeaders(res.headers()), body: redact(body) } },
    null,
    2,
  );
}
