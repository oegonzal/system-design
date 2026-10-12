import type { IsoDateString, Uuid } from '../primitives';
import type { ApplicationSource, ApplicationStatus, CorrectableStatus } from './vocab';

/**
 * One application as the record answers it. A session-sourced row's id is the
 * session's own unit id, so the record and `browser_task` name the same thing;
 * a hand-entered one is minted here.
 */
export interface ApplicationDto {
  id: Uuid;
  /** Whose application: the partition the record is kept under. */
  subject: string;
  company: string;
  label: string;
  url: string | null;
  source: ApplicationSource;
  sessionId: string | null;
  profile: string | null;
  unitOrdinal: number | null;
  status: ApplicationStatus;
  openedAt: IsoDateString;
  closedAt: IsoDateString | null;
  /** When a unit still in progress counts as abandoned with its session; null once it closed. */
  expiresAt: IsoDateString | null;
}

/** One company as the record sums it: how many applications, the latest, and what the latest stands as. */
export interface CompanyDto {
  company: string;
  applications: number;
  latestAt: IsoDateString;
  status: ApplicationStatus;
}

/** An application a person enters by hand — one made before the record existed, or outside a session. */
export interface CreateApplicationRequest {
  subject: string;
  company: string;
  /** The listing in the person's words; the company when unsaid. */
  label?: string;
  url?: string;
  /** `submitted` when unsaid. */
  status?: CorrectableStatus;
  /** When it was made; now when unsaid. */
  appliedAt?: IsoDateString;
}

/** A status a person corrects — an abandoned unit confirmed as submitted, or one released that never was. */
export interface CorrectApplicationRequest {
  status: CorrectableStatus;
}
