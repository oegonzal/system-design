/**
 * The product's completion criteria as a typed registry.
 *
 * Tests claim a criterion by putting its id in the title — `it('[EVAL-1] …')`,
 * `test('[UX-2] …')` — which is the one marker both Vitest and Playwright can
 * carry. A coverage spec (tooling) fails when any registered id has no test, so
 * a requirement cannot silently lose its proof, and when a test claims an id
 * that is not registered, so a proof cannot point at nothing.
 */
import type { Criterion } from './criterion';
import { BROWSER_SESSION_CRITERIA } from './browser-session';
import { GOVCON_CRITERIA } from './govcon';
import { JOB_APPLICATION_CRITERIA } from './job-application';
import { NOTIFICATIONS_CRITERIA } from './notifications';
import { QUALITY_LOOP_CRITERIA } from './quality-loop';
import { QUALITY_LOOP_CLIENTS_CRITERIA } from './quality-loop-clients';
import { SITE_CRITERIA } from './site';
import { STUDIO_CRITERIA } from './studio';
import { WEB_CRITERIA } from './web';

export type { Criterion } from './criterion';

export const CRITERIA: readonly Criterion[] = [
  ...STUDIO_CRITERIA,
  ...QUALITY_LOOP_CRITERIA,
  ...QUALITY_LOOP_CLIENTS_CRITERIA,
  ...GOVCON_CRITERIA,
  ...WEB_CRITERIA,
  ...BROWSER_SESSION_CRITERIA,
  ...NOTIFICATIONS_CRITERIA,
  ...JOB_APPLICATION_CRITERIA,
  ...SITE_CRITERIA,
];
