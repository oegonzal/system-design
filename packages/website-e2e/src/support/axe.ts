import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Page } from '@playwright/test';

/**
 * axe-core from the package itself, evaluated through the browser protocol: the
 * page's Content-Security-Policy governs the page's own scripts, never an
 * evaluation, so the site's strict CSP stays on while axe runs — and any
 * violation of it still surfaces in the console checks.
 */
const AXE_SOURCE = readFileSync(join(dirname(require.resolve('axe-core')), 'axe.min.js'), 'utf8');

/** WCAG 2.0–2.2 A and AA, plus axe's best practices (landmarks, heading order, one h1). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** The fields read here, declared structurally rather than taken from axe-core's types. */
interface AxeResults {
  violations: { id: string; impact?: string | null; help: string; nodes: { target: string[] }[] }[];
}

declare global {
  interface Window {
    axe: { run(context: Document, options: object): Promise<AxeResults> };
  }
}

/** Every axe violation on the page, one readable line each. */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async (tags) => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations'],
    });
    return results.violations.map(
      ({ id, impact, help, nodes }) =>
        `${id} (${impact ?? 'n/a'}): ${help} — ${nodes.map(({ target }) => target.join(' ')).join(', ')}`,
    );
  }, TAGS);
}
