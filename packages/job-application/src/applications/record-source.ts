import { Inject, Injectable } from '@nestjs/common';
import {
  ADVICE_UNITS_BOUND,
  COMPANY_FACET,
  JOB_APPLICATION_ADVISOR_ID,
  type AdvisorDescriptor,
  type UnitAdvice,
  type UnitAdviceRequest,
  type UnitOnRecord,
  type UnitStance,
} from '@sysdesign/contracts';

import type { RecordSource } from '../advisor/ports';
import { CLOCK, type Clock } from '../common/clock';
import { movedAt, type Application } from './application';
import {
  neverOnRecord,
  POLICY,
  skippedEnough,
  stanceOf,
  standingOf,
  windowStart,
  withinWindow,
  type ScatterPolicy,
} from './policy';
import { APPLICATION_STORE, type ApplicationStore } from './ports';

const day = (at: Date): string => at.toISOString().slice(0, 10);

/** Forbidden first: what the validator will cut is what the planner must read first. */
const RANK: Record<UnitStance, number> = { forbid: 0, avoid: 1 };

/**
 * The asker's own unit still in progress is no other session's: it is the
 * open unit the asker's goal already renders, and read as forbidden it made a
 * session set aside every unit it opened. Measured 2026-10-12, session
 * 79947605: three units in a row closed `skipped` at the form's first page,
 * each "on record as forbidden — in progress in another session".
 */
const ownOpenUnit = (application: Application, asker: UnitAdviceRequest['asker']): boolean =>
  application.status === 'in-progress' && application.sessionId === asker.id;

/** What the record knows of a company, in a few words, from the applications that earned its stance. */
function noteOf(latestFirst: readonly Application[], stance: UnitStance, now: Date): string {
  const standing = latestFirst.map((application) => standingOf(application, now));
  const at = (status: string): Application | undefined =>
    latestFirst[standing.findIndex((candidate) => candidate === status)];
  if (stance === 'forbid') {
    const open = at('in-progress');
    return open === undefined
      ? 'in progress'
      : `in progress in another session since ${day(open.openedAt)}`;
  }
  const submitted = at('submitted');
  if (submitted !== undefined) {
    const count = standing.filter((status) => status === 'submitted').length;
    return `applied ${day(movedAt(submitted))}${count > 1 ? `, ${count} applications` : ''}`;
  }
  const seen = at('submitted-before');
  if (seen !== undefined) return `seen applied on ${day(movedAt(seen))}`;
  const interrupted = at('abandoned');
  if (interrupted !== undefined) {
    return `interrupted on ${day(movedAt(interrupted))} — may have gone through`;
  }
  const skipped = standing.filter((status) => status === 'skipped').length;
  return `set aside ${skipped} times`;
}

/**
 * One subject's applications as the units on record: one per company under
 * the shared key — whatever its spellings — with the strongest stance any of
 * its applications earns, the forbidden first and then the latest first.
 * A company that earns no stance is not on record.
 */
export function onRecord(
  applications: readonly Application[],
  policy: ScatterPolicy,
  now: Date,
): UnitOnRecord[] {
  const byKey = new Map<string, Application[]>();
  for (const application of applications) {
    if (neverOnRecord(policy, application.identityKey)) continue;
    byKey.set(application.identityKey, [
      ...(byKey.get(application.identityKey) ?? []),
      application,
    ]);
  }
  const ranked: { unit: UnitOnRecord; latest: number }[] = [];
  for (const group of byKey.values()) {
    const latestFirst = [...group].sort((a, b) => movedAt(b).getTime() - movedAt(a).getTime());
    const stances = latestFirst.map((application) => stanceOf(application, policy, now));
    const skipped = latestFirst.filter(
      (application) =>
        withinWindow(application, policy, now) && standingOf(application, now) === 'skipped',
    ).length;
    const stance: UnitStance | null = stances.includes('forbid')
      ? 'forbid'
      : stances.includes('avoid') || skippedEnough(policy, skipped)
        ? 'avoid'
        : null;
    const latest = latestFirst[0];
    if (stance === null || latest === undefined) continue;
    ranked.push({
      unit: {
        identity: [{ name: COMPANY_FACET, value: latest.company }],
        stance,
        note: noteOf(latestFirst, stance, now),
      },
      latest: movedAt(latest).getTime(),
    });
  }
  return ranked
    .sort((a, b) => RANK[a.unit.stance] - RANK[b.unit.stance] || b.latest - a.latest)
    .map((entry) => entry.unit);
}

/** The record as the advisor protocol reads it. */
@Injectable()
export class ApplicationRecordSource implements RecordSource {
  constructor(
    @Inject(APPLICATION_STORE) private readonly store: ApplicationStore,
    @Inject(POLICY) private readonly policy: ScatterPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  describe(): AdvisorDescriptor {
    return { id: JOB_APPLICATION_ADVISOR_ID, facets: [COMPANY_FACET] };
  }

  async unitsOnRecord(request: UnitAdviceRequest): Promise<UnitAdvice> {
    const now = this.clock();
    const applications = (
      await this.store.since(request.subject, windowStart(this.policy, now))
    ).filter((application) => !ownOpenUnit(application, request.asker));
    const units = onRecord(applications, this.policy, now);
    return {
      advisor: JOB_APPLICATION_ADVISOR_ID,
      units: units.slice(0, ADVICE_UNITS_BOUND.target),
      omitted: Math.max(0, units.length - ADVICE_UNITS_BOUND.target),
    };
  }
}
