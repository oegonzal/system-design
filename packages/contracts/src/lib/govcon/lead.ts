import type { ApiResponse } from '../envelope';
import type { Opportunity } from './opportunity';
import type { LeadTier } from './vocab';

/** One factor's contribution: `points = 100 × weight × value`, one decimal; the traces sum to the score. */
export interface FactorTrace {
  id: string;
  value: number;
  weight: number;
  points: number;
  evidence: string[];
}

export interface Lead {
  opportunity: Opportunity;
  /** 0–100, one decimal; 0 when excluded. */
  score: number;
  tier: LeadTier | null;
  factors: FactorTrace[];
  excluded: { factor: string; reason: string } | null;
}

/** `GET /leads`: what was considered, what a gate removed, what the filters kept. */
export interface LeadsReport {
  profile: string;
  /** Stored records that were active with an open (or unstated) deadline. */
  candidates: number;
  excluded: number;
  /** Leads over the score and tier filters, before the limit. */
  matching: number;
  leads: Lead[];
}

export interface ListLeadsQuery {
  profile?: string;
  minScore?: number;
  tier?: LeadTier;
  limit?: number;
}

export type ListLeadsResponse = ApiResponse<LeadsReport>;
