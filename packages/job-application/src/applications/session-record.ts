import { Inject, Injectable } from '@nestjs/common';
import {
  TASK_OUTCOME_APPLICATION_STATUS,
  type SessionEnded,
  type SessionStarted,
  type SessionUnitClosed,
  type SessionUnitOpened,
} from '@sysdesign/contracts';

import { companyKey, companyOf, type Application } from './application';
import { APPLICATION_STORE, type ApplicationStore } from './ports';

const MINUTE_MS = 60_000;

/** What one event did to the record. */
export type RecordChange = 'inserted' | 'updated' | 'known' | 'no-company';

/**
 * A session's events moving the record along a monotone lattice. An opened
 * unit is inserted in progress and never changes a row that exists; a closed
 * unit is terminal and overrides anything, abandoned included; a session's
 * end and a new session on the same profile and subject abandon only what is
 * still in progress. Hearing the same event twice changes nothing.
 */
@Injectable()
export class SessionRecord {
  constructor(@Inject(APPLICATION_STORE) private readonly store: ApplicationStore) {}

  /** One profile runs one browser: a new session there means the earlier one is dead, and its open units died with it. */
  async started(event: SessionStarted, at: Date): Promise<number> {
    const dead = await this.store.inProgress({
      profile: event.profile,
      subject: event.subject,
      exceptSessionId: event.sessionId,
    });
    for (const application of dead) await this.store.setStatus(application.id, 'abandoned', at);
    return dead.length;
  }

  async opened(event: SessionUnitOpened, at: Date): Promise<RecordChange> {
    const company = companyOf(event.unit.facets);
    if (company === null) return 'no-company';
    const inserted = await this.store.insert({
      ...rowOf(event, company),
      status: 'in-progress',
      openedAt: at,
      closedAt: null,
      expiresAt: new Date(at.getTime() + event.maxMinutes * MINUTE_MS),
    });
    return inserted ? 'inserted' : 'known';
  }

  async closed(event: SessionUnitClosed, at: Date): Promise<RecordChange> {
    const company = companyOf(event.unit.facets);
    if (company === null) return 'no-company';
    const status = TASK_OUTCOME_APPLICATION_STATUS[event.outcome];
    const existing = await this.store.find(event.unit.id);
    if (existing === null) {
      // A close that arrived without its open: the record takes what it says.
      await this.store.insert({
        ...rowOf(event, company),
        status,
        openedAt: at,
        closedAt: at,
        expiresAt: null,
      });
      return 'inserted';
    }
    await this.store.setStatus(existing.id, status, at);
    return 'updated';
  }

  async ended(event: SessionEnded, at: Date): Promise<number> {
    const open = await this.store.inProgress({ sessionId: event.sessionId });
    for (const application of open) await this.store.setStatus(application.id, 'abandoned', at);
    return open.length;
  }
}

type UnitEvent = SessionUnitOpened | SessionUnitClosed;

const rowOf = (
  event: UnitEvent,
  company: string,
): Omit<Application, 'status' | 'openedAt' | 'closedAt' | 'expiresAt'> => ({
  id: event.unit.id,
  subject: event.subject,
  company,
  identityKey: companyKey(company),
  label: event.unit.label,
  url: event.unit.url,
  source: 'session',
  sessionId: event.sessionId,
  profile: event.profile,
  unitOrdinal: event.unit.ordinal,
});
