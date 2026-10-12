/**
 * The knowledge orchestrator's own wire types: the kinds of knowledge a
 * finished run can yield, the reasons its steps may give, what the `known`
 * step reports, and the two read-only memory reports beside it. The run itself
 * is an `OrchestrationRunDto` and its context a `MemoryContextDto`.
 *
 * A lesson — what the memory orchestrator stores — says what to do next time.
 * These kinds say what is true, what fails, what worked and what fixed it, and
 * they are kept apart because a reader uses them differently: a fact is
 * evidence, an anti-pattern a warning, a pattern a precedent, a procedure a
 * repair. Nothing here names a domain: the kinds, the polarity and the
 * dimension a stored item carries are as true of a code review as of a design.
 */
import { z } from 'zod';

import type { ApiResponse } from '../envelope';
import type { IsoDateString } from '../primitives';
import type { Lesson } from './decision';
import type { EvidenceResult } from './evidence';
import type { Severity } from './vocab';

export const KNOWLEDGE_ORCHESTRATOR_ID = 'knowledge';

/**
 * What a run can be worth remembering, as the digest types it. A `fact` holds
 * with the design removed; an `anti_pattern` is a mechanism that failed and
 * why; a `pattern` is one that satisfied a criterion; a `procedure` is a
 * change that resolved a defect, so it may only rest on evidence the engine
 * recorded as resolved.
 */
export const KNOWLEDGE_ITEM_KINDS = ['fact', 'anti_pattern', 'pattern', 'procedure'] as const;
export type KnowledgeItemKind = (typeof KNOWLEDGE_ITEM_KINDS)[number];

/** Whether an item tells a reader to do something or to avoid it; derived from the kind, never written. */
export const KNOWLEDGE_POLARITIES = ['do', 'avoid'] as const;
export type KnowledgePolarity = (typeof KNOWLEDGE_POLARITIES)[number];

/** How strongly a stored item is grounded, derived from the transitions of the evidence it rests on. */
export const KNOWLEDGE_GROUNDINGS = ['proven', 'held', 'observed'] as const;
export type KnowledgeGrounding = (typeof KNOWLEDGE_GROUNDINGS)[number];

/** What one run's evidence said about an item another run stored. */
export const SUPPORT_KINDS = ['confirms', 'contradicts'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/**
 * The transitions a stored item's evidence may carry, pinned to the engine's
 * own `Lesson` kinds so the two can never drift. A chunk facet, not a verdict.
 */
export const TRANSITION_KINDS = [
  'resolved',
  'improved',
  'persisted',
  'regressed',
] as const satisfies readonly Lesson['kind'][];
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/**
 * Why a knowledge step skipped, failed, or completed without effect — beyond
 * the runner's own reasons. A child run that was judged and fell short is
 * `not-accepted`; one that was never judged says why instead. `no-probes` and
 * `source-pipeline-unknown` are this orchestrator's alone: a run with neither
 * findings nor criteria has nothing to ask the store about, and a run of a
 * pipeline the registry no longer holds has no policy to read a dimension from.
 */
export const KNOWLEDGE_STEP_REASONS = [
  'embeddings-disabled',
  'store-unavailable',
  'store-empty',
  'embedding-failed',
  'support-unavailable',
  'not-accepted',
  'no-rubric',
  'no-artifact',
  'nothing-to-digest',
  'no-probes',
  'no-items',
  'source-pipeline-unknown',
] as const;
export type KnowledgeStepReason = (typeof KNOWLEDGE_STEP_REASONS)[number];

/** What the `known` step reports: the items the digest was shown, by the alias it cites them under. */
export const knowledgeKnownReportSchema = z.strictObject({
  known: z.array(
    z.strictObject({ alias: z.string(), runId: z.string(), ref: z.string(), kind: z.string() }),
  ),
});
export type KnowledgeKnownReportDto = z.infer<typeof knowledgeKnownReportSchema>;

/** What the `digest` step reports: whose policy the dimension map came from. */
export const knowledgeDigestReportSchema = z.strictObject({
  source: z.strictObject({ pipeline: z.string(), version: z.string() }),
  known: z.number().int().nonnegative(),
});
export type KnowledgeDigestReportDto = z.infer<typeof knowledgeDigestReportSchema>;

/**
 * The facets a stored chunk carries beyond its provenance: what a search may
 * filter on and what a curator's rule may read. Every field is optional —
 * chunks stored before they existed carry none.
 */
export interface ChunkFacetsDto {
  polarity?: KnowledgePolarity;
  /** The dimension of the source pipeline the item's evidence lands on; null when its policy maps none. */
  dimension?: string | null;
  topics?: string[];
  criterionKinds?: string[];
  findingTypes?: string[];
  transition?: TransitionKind | null;
  grounding?: KnowledgeGrounding;
  severity?: Severity;
  /** How many other runs' evidence confirmed or contradicted this item. */
  support?: { confirms: number; contradicts: number };
}

/**
 * What became of one defect a recall was focused on. `unchanged` means a later
 * iteration judged it and it neither moved nor recurred; `no-next-iteration`
 * means nothing judged it again, which is no verdict at all.
 */
export const FOCUS_OUTCOMES = [
  'resolved',
  'persisted',
  'improved',
  'regressed',
  'unchanged',
  'no-next-iteration',
] as const;
export type FocusOutcome = (typeof FOCUS_OUTCOMES)[number];

export interface FocusOutcomeDto {
  /** The finding key or criterion id the recall searched for. */
  subject: string;
  kind: 'finding' | 'criterion';
  /** A criterion's result in the iteration the recall was focused on; null for a finding. */
  from: EvidenceResult | null;
  outcome: FocusOutcome;
}

/** One lesson a producer was handed, and how far it got through the recall it came from. */
export interface BriefedLessonDto {
  /** The alias the curator kept it under on that recall. */
  ref: string;
  /** The run the lesson was digested from, and the item within it — the stored point. */
  sourceRunId: string;
  sourceRef: string;
  offered: boolean;
  kept: boolean;
  briefed: boolean;
}

export interface EffectivenessRunDto {
  runId: string;
  pipeline: string;
  recallRunId: string | null;
  /** The iteration the run started from, whose defects the recall searched for. */
  baseIteration: number | null;
  lessons: BriefedLessonDto[];
  focus: FocusOutcomeDto[];
  /** The share of focused defects that resolved or improved; null when nothing judged them again. */
  focusResolvedShare: number | null;
}

export interface EffectivenessChunkDto {
  sourceRunId: string;
  ref: string;
  offered: number;
  kept: number;
  briefed: number;
  runsWithAnyFocusResolved: number;
  meanFocusResolvedShare: number | null;
}

/**
 * Whether recalled lessons went with runs whose defects then resolved. The
 * attribution is deliberately **run-level**: which lesson served which defect
 * is prose on the curator's pack, so tying one lesson to one outcome would
 * mean reading it. A run's lessons are reported beside that run's outcomes and
 * nothing claims more.
 */
export interface RecallEffectivenessDto {
  scanned: number;
  attribution: 'run-level';
  runs: EffectivenessRunDto[];
  chunks: EffectivenessChunkDto[];
}

export type RecallEffectivenessResponse = ApiResponse<RecallEffectivenessDto>;

/** One need no recalled chunk served, and every recall that said so. */
export interface GapDto {
  text: string;
  namedIn: string[];
  first: IsoDateString;
  last: IsoDateString;
}

/** The gaps of every recall for one brief, which is what the store has yet to learn about it. */
export interface GapGroupDto {
  /** sha256 of the brief, taken bare — the same prompt recalled twice groups once. */
  goalHash: string;
  goalHead: string;
  recalls: number;
  gaps: GapDto[];
}

/**
 * What recalls could not serve, by brief. Every memory-recall run names the
 * needs of its query no candidate informed; this is that list, kept, so what
 * the store is missing is readable instead of discarded.
 */
export interface StandingGapsDto {
  scanned: number;
  /** Recalls whose brief could not be resolved, so their gaps belong to no group. */
  unattributed: number;
  groups: GapGroupDto[];
}

export type StandingGapsResponse = ApiResponse<StandingGapsDto>;
