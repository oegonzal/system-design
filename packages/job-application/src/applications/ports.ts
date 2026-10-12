import type { ApplicationStatus } from '@sysdesign/contracts';

import type { Application } from './application';

export const APPLICATION_STORE = Symbol('APPLICATION_STORE');

/** What one subject's applications are read by. */
export interface ApplicationsQuery {
  subject: string;
  /** A company by its spelling; matched by the shared key. */
  company?: string;
  status?: ApplicationStatus;
  /** Opened at or after. */
  since?: Date;
  limit: number;
  offset: number;
}

/** Rows still in progress: a session's own, or a profile and subject's but another session's. */
export type InProgressFilter =
  { sessionId: string } | { profile: string; subject: string; exceptSessionId: string };

/** The record, kept apart from the session's own tables: the session is another service. */
export interface ApplicationStore {
  find(id: string): Promise<Application | null>;
  /** Inserts when no row has the id; whether it did. */
  insert(application: Application): Promise<boolean>;
  /** A status set on one row, with when it closed; a terminal status clears the expiry. */
  setStatus(id: string, status: ApplicationStatus, closedAt: Date | null): Promise<void>;
  /** One subject's applications that moved at or after a date, latest first. */
  since(subject: string, since: Date): Promise<Application[]>;
  list(query: ApplicationsQuery): Promise<Application[]>;
  inProgress(filter: InProgressFilter): Promise<Application[]>;
}
