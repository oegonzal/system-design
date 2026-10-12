import type { TaskOutcome } from '../browser-session/vocab';

/**
 * Job applications: what a unit of work stands as in the record, and where a
 * record came from. The browser session's outcomes map onto the record's
 * statuses once and one way; `in-progress` and `abandoned` are the record's
 * own, and the ones that come later — an interview, an offer — will be too.
 */
export const APPLICATION_STATUSES = [
  'in-progress',
  'submitted',
  'submitted-before',
  'skipped',
  'failed',
  'abandoned',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** The status a unit closes into, by the outcome the session reported. */
export const TASK_OUTCOME_APPLICATION_STATUS = {
  done: 'submitted',
  'already-done': 'submitted-before',
  skipped: 'skipped',
  failed: 'failed',
} as const satisfies Record<TaskOutcome, ApplicationStatus>;

/** The statuses a person may enter or correct a record to by hand: every one but what only a running session means. */
export const CORRECTABLE_STATUSES = [
  'submitted',
  'submitted-before',
  'skipped',
  'failed',
  'abandoned',
] as const satisfies readonly ApplicationStatus[];
export type CorrectableStatus = (typeof CORRECTABLE_STATUSES)[number];

/** Where a record came from: a session's unit, or a person's hand. */
export const APPLICATION_SOURCES = ['session', 'manual'] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

/** How the service names itself to a mission's `## Advisors`, and the one declared fact it keeps its record by. */
export const JOB_APPLICATION_ADVISOR_ID = 'job-application';
export const COMPANY_FACET = 'company';
