/**
 * axe-core (WCAG 2.0/2.1 A + AA) scan helper for the a11y suite. Wraps @axe-core/playwright.
 * Violations carry an `impact` (critical|serious|moderate|minor); critical+serious are the fail threshold.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

export const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export interface Violation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  help: string;
  helpUrl: string;
  nodes: { target: string[] }[];
}

export async function scan(page: Page, opts?: { include?: string; disableRules?: string[] }): Promise<Violation[]> {
  let b = new AxeBuilder({ page }).withTags(A11Y_TAGS);
  if (opts?.include) b = b.include(opts.include);
  if (opts?.disableRules?.length) b = b.disableRules(opts.disableRules);
  const res = await b.analyze();
  return res.violations as unknown as Violation[];
}

/** critical + serious — the blocking set an a11y test fails on. */
export function blocking(vs: Violation[]): Violation[] {
  return vs.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

export function summarize(vs: Violation[]): string {
  if (!vs.length) return 'no violations';
  return vs
    .map((v) => `[${v.impact}] ${v.id} ×${v.nodes.length} — ${v.help}\n    e.g. ${v.nodes[0]?.target.join(' ')}`)
    .join('\n');
}

/** Attach the full violation list to the report as redacted evidence (a11y has no PII — selectors only). */
export async function attachA11y(info: TestInfo, label: string, vs: Violation[]): Promise<void> {
  await info.attach(`axe-${label}`, { body: summarize(vs), contentType: 'text/plain' });
}
