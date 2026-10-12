import { UNIT_STANCES, type ApplicationStatus, type UnitStance } from '@sysdesign/contracts';
import { z } from 'zod';

import { companyKey, movedAt, type Application } from './application';

const stance = z.enum(UNIT_STANCES).nullable();

/**
 * What stance the record takes on an application, from declared data alone.
 * The values live in the package's `config/policy/` files; each field's
 * meaning is said here. The stance map is total over the statuses, so a new
 * status is a declared choice and never recurs by omission.
 */
export const scatterPolicySchema = z.strictObject({
  /** How far back an application counts; one older says nothing. */
  windowDays: z.number().int().positive(),
  /** The stance each status takes, or null for one the record says nothing about — a retry stays open. */
  stances: z.strictObject({
    'in-progress': stance,
    submitted: stance,
    'submitted-before': stance,
    skipped: stance,
    failed: stance,
    abandoned: stance,
  }) satisfies z.ZodType<Record<ApplicationStatus, UnitStance | null>>,
  /** Values that identify no single employer — an agency posting for many clients — kept out of the record by data, never by a rule over the name. */
  neverOnRecord: z.array(z.string().min(1)),
  /** After this many set-asides within the window a company is avoided — the listing that only offers another site, opened every session; null never. */
  skippedBecomesAvoidAfter: z.number().int().positive().nullable(),
});
export type ScatterPolicy = z.infer<typeof scatterPolicySchema>;

export const POLICY = Symbol('POLICY');

const DAY_MS = 86_400_000;

/** The start of the policy's window, as of now. */
export const windowStart = (policy: ScatterPolicy, now: Date): Date =>
  new Date(now.getTime() - policy.windowDays * DAY_MS);

/** Whether an application moved within the window. */
export const withinWindow = (application: Application, policy: ScatterPolicy, now: Date): boolean =>
  movedAt(application).getTime() >= windowStart(policy, now).getTime();

/** The status an application stands at now: one still in progress past its session's declared lifetime was abandoned with it. */
export const standingOf = (application: Application, now: Date): ApplicationStatus =>
  application.status === 'in-progress' &&
  application.expiresAt !== null &&
  application.expiresAt.getTime() <= now.getTime()
    ? 'abandoned'
    : application.status;

/** Whether a company is one the record keeps nothing on, by the shared key. */
export const neverOnRecord = (policy: ScatterPolicy, key: string): boolean =>
  policy.neverOnRecord.some((value) => companyKey(value) === key);

/** The stance one application earns, or null when the record says nothing: outside the window, a status without a stance, a company never on record. */
export function stanceOf(
  application: Application,
  policy: ScatterPolicy,
  now: Date,
): UnitStance | null {
  if (neverOnRecord(policy, application.identityKey)) return null;
  if (!withinWindow(application, policy, now)) return null;
  return policy.stances[standingOf(application, now)];
}

/** Whether set-asides alone earn an avoidance: the declared count reached within the window. */
export const skippedEnough = (policy: ScatterPolicy, skipped: number): boolean =>
  policy.skippedBecomesAvoidAfter !== null && skipped >= policy.skippedBecomesAvoidAfter;
