import type { ApiListResponse, ApiResponse } from './envelope';
import type { Archetype } from './experiences';
import type { IsoDateString, Uuid } from './primitives';
// Type-only on purpose: workflow-spec.ts imports PROMPT_DIFFICULTIES from
// this module at runtime, so a value import here would be a cycle.
import type { WorkflowSpec } from './workflow-spec';

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

/**
 * The machine-readable half of an NFR target — what the eval engine can
 * check without parsing prose. The generator derives it from the same
 * baseline numbers the prose quotes, so the two can never drift.
 */
export interface NfrTargetSpec {
  /** Snake-case metric name, e.g. 'p99_latency_ms', 'availability_pct'. */
  metric: string;
  op: '<=' | '>=' | '=';
  value: number;
  unit: string;
}

export interface NfrItem {
  /**
   * Stable id within the archetype bank, e.g. 'fst-lat-read-spike'.
   * Findings reference it, so evaluations can prove which requirement a
   * design misses.
   */
  id: string;
  kind: NfrKind;
  /** The requirement as prose, e.g. "Reads stay fast under the on-sale spike". */
  statement: string;
  /** A measurable target when one exists, e.g. "p99 ≤ 200ms". */
  target?: string;
  /** Present when the prose target quantifies a single checkable number. */
  targetSpec?: NfrTargetSpec;
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

/**
 * What a functional requirement demands of the design, as a closed
 * vocabulary the engine can gate on.
 *
 * The same trick as `NfrItem.targetSpec`: a machine-readable field beside the
 * human sentence. Rules used to grep the requirement prose (`includes('search')`,
 * `/dashboard|analytic|report/`), which made grading hostage to wording — a
 * requirement reworded "find past runs by tag" silently switched a rule off,
 * and free text appended by prompt enrichment could switch one on. Capabilities
 * are declared by the requirement bank that authors the sentence, so the two
 * can never drift.
 */
export const FUNCTIONAL_CAPABILITIES = [
  /** Free-text lookup over stored entities — a catalog or archive search. */
  'search',
  /** Dashboards, reporting, aggregates over history. */
  'analytics',
  /** Money movement: checkout, capture, refund. */
  'payments',
  /** Work that must happen later: delays, timers, waits between steps. */
  'scheduled-work',
] as const;
export type FunctionalCapability = (typeof FUNCTIONAL_CAPABILITIES)[number];

export interface PromptDto {
  id: Uuid;
  experienceId: Uuid;
  archetype: Archetype;
  title: string;
  scenario: string;
  functionalRequirements: string[];
  /** Union of the capabilities the drawn functional requirements demand. */
  functionalCapabilities: FunctionalCapability[];
  nonFunctionalRequirements: NfrItem[];
  scaleTargets: ScaleTargets;
  /**
   * The machine-readable business layer — contracts, events, ingests,
   * lifecycles (see `workflow-spec.ts`). Null on prompts whose archetype
   * declares none; its absence is what keeps the `product` dimension out of
   * their rubric.
   */
  workflowSpec: WorkflowSpec | null;
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
  /**
   * Omitted → "surprise me": the service rotates to the least-practiced
   * experience, so repeated practice covers every archetype instead of
   * re-drilling one.
   */
  experienceId?: Uuid;
  difficulty?: PromptDifficulty;
  seed?: number;
}

/**
 * A prompt authored from an assessment's own requirements — "bring your own
 * take-home". The requirement set is given verbatim rather than drawn from a
 * bank, validated against the same closed vocabularies and workflow-spec
 * closure the generator honors, and graded by the experience's archetype
 * rubric exactly as it applies to those requirements: an NFR kind the
 * assessment never states gates its expectations off, a workflow item it
 * never declares is never demanded. Scale targets are the author's stated
 * assumptions (the engine always reads them); `generatorVersion` records the
 * provenance as `AUTHORED_GENERATOR_VERSION`.
 */
export interface AuthorPromptRequest {
  experienceId: Uuid;
  title: string;
  scenario: string;
  difficulty: PromptDifficulty;
  functionalRequirements: string[];
  functionalCapabilities: FunctionalCapability[];
  nonFunctionalRequirements: NfrItem[];
  scaleTargets: ScaleTargets;
  workflowSpec: WorkflowSpec | null;
}

/** The `generatorVersion` of an authored prompt — provenance, not a generator release. */
export const AUTHORED_GENERATOR_VERSION = 'authored';

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
