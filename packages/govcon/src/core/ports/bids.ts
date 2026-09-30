import type { BidStage, Opportunity } from '@sysdesign/contracts';

/** What a save carries; every field is the client's to set. */
export interface BidInput {
  stage: BidStage;
  notes: string;
  reminderAt: Date | null;
  estimatedValue: number | null;
}

export interface BidRecord extends BidInput {
  noticeId: string;
  stageChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** A bid with the notice it tracks — what the pipeline shows and what "due soon" is read from. */
export interface BidWithNotice {
  bid: BidRecord;
  opportunity: Opportunity;
}

export interface PipelineFilter {
  stage: BidStage | null;
  limit: number;
  offset: number;
}

/** Bids keyed by notice: at most one per stored notice, gone with it. */
export interface BidRepository {
  find(noticeId: string): Promise<BidRecord | null>;
  /** Insert or replace; `stageChangedAt` is `at` when the stage is new or changed, else kept. */
  save(noticeId: string, input: BidInput, at: Date): Promise<BidRecord>;
  remove(noticeId: string): Promise<boolean>;
  /** Newest change first, with the total over the filter. */
  list(filter: PipelineFilter): Promise<[BidWithNotice[], number]>;
  /** Every bid with its notice — the pipeline is human-sized. */
  listAll(): Promise<BidWithNotice[]>;
}
