import type { ApiListResponse, ApiResponse } from '../envelope';
import type {
  TargetActivityKind,
  TargetContactRole,
  TargetKind,
  TargetLinkKind,
  TargetStage,
} from './vocab';

/** Someone to reach about a target: who, in what role, how, and a note. */
export interface TargetContact {
  name: string;
  role: TargetContactRole;
  /** How to reach them — an address, a number, a portal — as the person wrote it. */
  channel: string;
  note: string;
}

/** A page kept on a target: what it is, where, and what to call it. */
export interface TargetLink {
  kind: TargetLinkKind;
  url: string;
  label: string;
}

/** One thing done about a target, when, in a line — and what it points at, when it points at something: a drafted note's run id. */
export interface TargetActivity {
  /** ISO 8601. */
  at: string;
  kind: TargetActivityKind;
  summary: string;
  ref: string | null;
}

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
  /** What to do next about it, in a line; the reminder says when. */
  nextAction: string;
  /** Who to reach about it. */
  contacts: TargetContact[];
  /** Its pages: website, supplier portal, small-business page. */
  links: TargetLink[];
  /** What was done about it, in the order it was logged. */
  activity: TargetActivity[];
  /** ISO 8601; the client surfaces it when it is within `DUE_SOON_DAYS`. */
  reminderAt: string | null;
  /** An award's end as the daily warm last read it, ISO date; null for a firm, and for an award not read yet. */
  endsAt: string | null;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** `PUT /targets/:kind/:subject`: the whole editable part; an omitted field keeps its value, and a list given replaces the whole list. */
export interface SaveTargetRequest {
  label: string;
  stage: TargetStage;
  notes?: string;
  nextAction?: string;
  contacts?: TargetContact[];
  links?: TargetLink[];
  activity?: TargetActivity[];
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
