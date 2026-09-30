import type { ApiListResponse, ApiResponse } from '../envelope';
import type { Lead } from './lead';
import type { BidStage } from './vocab';

/** One notice's place in the pipeline; at most one row per notice. */
export interface Bid {
  noticeId: string;
  stage: BidStage;
  notes: string;
  /** ISO 8601; the client surfaces it when it is within `DUE_SOON_DAYS`. */
  reminderAt: string | null;
  estimatedValue: number | null;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** `PUT /notices/:noticeId/bid`: the whole editable part; omitted fields keep their value. */
export interface SaveBidRequest {
  stage: BidStage;
  notes?: string;
  reminderAt?: string | null;
  estimatedValue?: number | null;
}

/** `GET /pipeline`: every bid with its notice scored against the profile. */
export interface PipelineRow {
  bid: Bid;
  lead: Lead;
}

export interface BidPipelineSummary {
  byStage: Record<BidStage, number>;
  /** Bids whose reminder or deadline falls inside `DUE_SOON_DAYS`. */
  dueSoon: number;
  total: number;
}

export interface ListPipelineQuery {
  profile?: string;
  stage?: BidStage;
  limit?: number;
  offset?: number;
}

export type SaveBidResponse = ApiResponse<Bid>;
export type ListPipelineResponse = ApiListResponse<PipelineRow>;
export type GetBidPipelineSummaryResponse = ApiResponse<BidPipelineSummary>;
