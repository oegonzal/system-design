import type { ApplicationStatus } from '@sysdesign/contracts';

import { companyKey, movedAt, type Application } from './application';
import type { ApplicationsQuery, ApplicationStore, InProgressFilter } from './ports';

/** The record in memory, for specs: the same transitions the Postgres store makes. */
export class InMemoryApplicationStore implements ApplicationStore {
  readonly rows = new Map<string, Application>();

  async find(id: string): Promise<Application | null> {
    return this.rows.get(id) ?? null;
  }

  async insert(application: Application): Promise<boolean> {
    if (this.rows.has(application.id)) return false;
    this.rows.set(application.id, { ...application });
    return true;
  }

  async setStatus(id: string, status: ApplicationStatus, closedAt: Date | null): Promise<void> {
    const row = this.rows.get(id);
    if (row === undefined) return;
    row.status = status;
    row.closedAt = closedAt;
    if (status !== 'in-progress') row.expiresAt = null;
  }

  async since(subject: string, since: Date): Promise<Application[]> {
    return [...this.rows.values()]
      .filter((row) => row.subject === subject && movedAt(row).getTime() >= since.getTime())
      .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  }

  async list(query: ApplicationsQuery): Promise<Application[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.subject === query.subject &&
          (query.company === undefined || row.identityKey === companyKey(query.company)) &&
          (query.status === undefined || row.status === query.status) &&
          (query.since === undefined || row.openedAt.getTime() >= query.since.getTime()),
      )
      .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
      .slice(query.offset, query.offset + query.limit);
  }

  async inProgress(filter: InProgressFilter): Promise<Application[]> {
    return [...this.rows.values()].filter(
      (row) =>
        row.status === 'in-progress' &&
        ('sessionId' in filter
          ? row.sessionId === filter.sessionId
          : row.profile === filter.profile &&
            row.subject === filter.subject &&
            row.sessionId !== filter.exceptSessionId),
    );
  }
}

/** An application as the record would hold it, for specs; every field overridable. */
export const application = (overrides: Partial<Application> = {}): Application => {
  const company = overrides.company ?? 'Acme';
  return {
    id: overrides.id ?? crypto.randomUUID(),
    subject: 'Alex Example',
    company,
    identityKey: companyKey(company),
    label: `Senior Engineer at ${company}`,
    url: null,
    source: 'session',
    sessionId: 'session-1',
    profile: 'spec',
    unitOrdinal: 1,
    status: 'submitted',
    openedAt: new Date('2026-10-03T10:00:00.000Z'),
    closedAt: new Date('2026-10-03T10:05:00.000Z'),
    expiresAt: null,
    ...overrides,
  };
};
