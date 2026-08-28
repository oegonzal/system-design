import type { ApiListResponse, ApiResponse } from './envelope';
import type { Archetype } from './experiences';
import type { IsoDateString, Uuid } from './primitives';

export const PROMPT_DIFFICULTIES = ['intro', 'standard', 'advanced'] as const;
export type PromptDifficulty = (typeof PROMPT_DIFFICULTIES)[number];

export const PROMPT_STATUSES = ['active', 'archived'] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];

export const NFR_KINDS = [
  'latency',
  'availability',
  'consistency',
  'durability',
  'throughput',
  'cost',
  'security',
  'observability',
] as const;
export type NfrKind = (typeof NFR_KINDS)[number];

export interface NfrItem {
  kind: NfrKind;
  /** The requirement as prose, e.g. "Reads stay fast under the on-sale spike". */
  statement: string;
  /** A measurable target when one exists, e.g. "p99 ≤ 200ms". */
  target?: string;
}

/**
 * The load the design is asked to survive. Deterministic generator output —
 * the eval engine reads these, so LLM enrichment never touches them.
 */
export interface ScaleTargets {
  concurrentUsers: number;
  requestsPerSecond: number;
  /** e.g. "95:5" — reads:writes. */
  readWriteRatio: string;
  p99LatencyMs: number;
  /** e.g. "99.9". A string so "99.95" survives serialization exactly. */
  availabilityPct: string;
  dataRetention?: string;
}

export interface PromptDto {
  id: Uuid;
  experienceId: Uuid;
  archetype: Archetype;
  title: string;
  scenario: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: NfrItem[];
  scaleTargets: ScaleTargets;
  difficulty: PromptDifficulty;
  status: PromptStatus;
  /** Generator input. Same experience + difficulty + seed → identical prompt. */
  seed: number;
  generatorVersion: string;
  llmEnriched: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

/** No server-owned fields — echoing a fetched PromptDto back is a compile error. */
export interface GeneratePromptRequest {
  experienceId: Uuid;
  difficulty?: PromptDifficulty;
  seed?: number;
}

export interface UpdatePromptRequest {
  status: PromptStatus;
}

export interface ListPromptsQuery {
  experienceId?: Uuid;
  difficulty?: PromptDifficulty;
  status?: PromptStatus;
  limit?: number;
  offset?: number;
}

export const PROMPT_TITLE_MAX_LENGTH = 120;

export type ListPromptsResponse = ApiListResponse<PromptDto>;
export type GetPromptResponse = ApiResponse<PromptDto>;
