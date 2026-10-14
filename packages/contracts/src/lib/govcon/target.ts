import type { ApiListResponse, ApiResponse } from '../envelope';
import type { TargetKind, TargetStage } from './vocab';

/**
 * Something the company pursues that is not a notice: a firm to work with,
 * or an award whose work may be bought again. At most one per kind and
 * subject. A sibling of a bid, which tracks a notice.
 */
export interface Target {
  id: string;
  kind: TargetKind;
  /** A firm's UEI, or an award's id at the source its record is read by. */
  subject: string;
  /** What it was called when it was tracked: a firm's name, an award's PIID. */
  label: string;
  stage: TargetStage;
  notes: string;
  /** Who to reach about it, as the person wrote it. */
  contact: string;
  /** ISO 8601; the client surfaces it when it is within `DUE_SOON_DAYS`. */
  reminderAt: string | null;
  /** An award's end as the daily warm last read it, ISO date; null for a firm, and for an award not read yet. */
  endsAt: string | null;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** `PUT /targets/:kind/:subject`: the whole editable part; omitted fields keep their value. */
export interface SaveTargetRequest {
  label: string;
  stage: TargetStage;
  notes?: string;
  contact?: string;
  reminderAt?: string | null;
}

export interface TargetSummary {
  /** Per kind, how many stand at each of its stages, zero included. */
  byKind: { [K in TargetKind]: Record<TargetStage<K>, number> };
  /** Targets whose reminder falls inside `DUE_SOON_DAYS`, or has passed. */
  dueSoon: number;
  total: number;
}

export interface ListTargetsQuery {
  kind?: TargetKind;
  stage?: TargetStage;
  limit?: number;
  offset?: number;
}

/** Null when nothing of that kind and subject is tracked. */
export type GetTargetResponse = ApiResponse<Target | null>;
export type SaveTargetResponse = ApiResponse<Target>;
export type ListTargetsResponse = ApiListResponse<Target>;
export type GetTargetSummaryResponse = ApiResponse<TargetSummary>;
