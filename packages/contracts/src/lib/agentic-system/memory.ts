/**
 * The agentic-memory runtime's wire shapes: what a caller remembers, updates,
 * invalidates and recalls, what a writer is briefed with, what consolidation
 * and a compile report answer, and the vocabulary a stored row is checked
 * against. A memory space is one memory strategy made executable — its
 * registers become stores, its declared interfaces the only verbs it serves,
 * its consolidation workflow the route a lesson takes. The runtime
 * (`@sysdesign/agentic-memory`) executes them, the agentic-system service
 * serves them over HTTP, and the db entity keeps the rows.
 *
 * A request names its scope as declared scope keys to values; the first key the
 * policy declares is the partition every request and every row carries. A memory
 * is visible to a request whose scope contains the memory's own — a tenant-wide
 * fact to every user in the tenant, a user's fact to that user alone.
 */
import { z } from 'zod';

import { bound, bounded, keptAtMost } from '../bounds';
import type { ApiValidationIssue } from '../envelope';
import type { IsoDateString, Uuid } from '../primitives';
import {
  REGISTER_NAME_BOUND,
  type MemoryTerm,
  type OperationVerb,
  type RegisterKind,
} from './strategy';
import { MEMORY_FIELD_NAME, type CompileWarning } from './executability';
import { STRATEGY_FAULTS } from './strategy-validator';

/** Where a stored memory is in its life. Only `active` is current, and only a current memory is recalled. */
export const RECORD_STATUSES = ['active', 'superseded', 'invalidated', 'expired'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** What a write did with a candidate. */
export const WRITE_OUTCOMES = ['inserted', 'unchanged', 'superseded'] as const;
export type WriteOutcome = (typeof WRITE_OUTCOMES)[number];

/** What consolidation did with a lesson or a playbook: a write's outcome, or its evidence reinforced or withdrawn. */
export const CONSOLIDATION_OUTCOMES = [...WRITE_OUTCOMES, 'reinforced', 'withdrawn'] as const;
export type ConsolidationOutcome = (typeof CONSOLIDATION_OUTCOMES)[number];

/** The ways a recall reaches a memory: by a key it holds, by meaning, or by when it held. */
export const RECALL_ROUTES = ['exact', 'semantic', 'temporal'] as const;
export type RecallRoute = (typeof RECALL_ROUTES)[number];

/** Why a requested route did not run. */
export const ROUTE_SKIPS = [
  'no_projected_register',
  'embedder_disabled',
  'embedding_failed',
  'index_failed',
] as const;
export type RouteSkip = (typeof ROUTE_SKIPS)[number];

/** Every refusal a memory verb can answer; the HTTP door gives each one declared status (`space-host.ts`). */
export const MEMORY_REFUSALS = [
  'space.not_found',
  'space.not_compiled',
  'space.name_taken',
  'register.unknown',
  'operation.undeclared',
  'scope.invalid',
  'candidate.invalid',
  'metadata.undeclared',
  'record.not_found',
  'record.not_current',
  'identity.mismatch',
  'conflict',
  'consolidation.unavailable',
] as const;
export type MemoryRefusal = (typeof MEMORY_REFUSALS)[number];

/** What stops a strategy compiling into a space. */
export const COMPILE_PROBLEMS = [
  ...STRATEGY_FAULTS,
  'strategy.unreadable',
  'policy.unreadable',
  'register.kind_unsupported',
] as const;
export type CompileProblem = (typeof COMPILE_PROBLEMS)[number];

const fieldName = z.string().regex(MEMORY_FIELD_NAME);
const ref = (max: number) => bounded.id(max, { min: 1 });
/** An instant with its offset, as every time a memory carries is written. */
export const instantSchema = z.iso.datetime({ offset: true });
/** Any register name a lenient read of a strategy can hold. */
const registerRef = ref(keptAtMost(REGISTER_NAME_BOUND));

/** Declared scope keys to their values; the keys and the partition are checked against the policy at the door. */
export const recordScopeSchema = z.record(fieldName, ref(160));
export type RecordScope = z.infer<typeof recordScopeSchema>;

const metadataSchema = z.record(fieldName, ref(200));

/** Where a memory came from. An independent source run counts once toward a lesson's support. */
export const provenanceSchema = z.strictObject({
  source: ref(120),
  sourceRunId: ref(80).nullable(),
});

const workingCandidateSchema = z.strictObject({
  key: ref(160),
  value: bounded.text(bound(2000), { min: 1 }),
});

const semanticCandidateSchema = z.strictObject({
  subject: ref(160),
  predicate: ref(80),
  value: bounded.text(bound(800), { min: 1 }),
  validFrom: instantSchema.nullable(),
});

const lessonSchema = z.strictObject({
  key: ref(160),
  text: bounded.text(bound(400), { min: 1 }),
  playbook: ref(160).nullable(),
});
export type MemoryLesson = z.infer<typeof lessonSchema>;

const episodicCandidateSchema = z.strictObject({
  subject: ref(160),
  situation: bounded.text(bound(400), { min: 1 }),
  action: bounded.text(bound(400), { min: 1 }),
  outcome: bounded.text(bound(400), { min: 1 }),
  outcomeVerified: z.boolean(),
  occurredAt: instantSchema,
  lesson: lessonSchema.nullable(),
});

const proceduralCandidateSchema = z.strictObject({
  name: ref(160),
  description: bounded.text(bound(600)).nullable(),
  rules: bounded.list(
    bound(24, 'list'),
    z.strictObject({ key: ref(160), text: bounded.text(bound(400), { min: 1 }) }),
    { min: 1 },
  ),
});

const relationalCandidateSchema = z.strictObject({
  subject: ref(160),
  relation: ref(80),
  object: ref(160),
  validFrom: instantSchema.nullable(),
});

/** The candidate a register of each kind accepts — the typed memory a caller remembers. */
export const CANDIDATE_SCHEMAS = {
  working: workingCandidateSchema,
  episodic: episodicCandidateSchema,
  semantic: semanticCandidateSchema,
  procedural: proceduralCandidateSchema,
  relational: relationalCandidateSchema,
} as const satisfies Record<RegisterKind, z.ZodType>;
export type CandidateOf<K extends RegisterKind> = z.infer<(typeof CANDIDATE_SCHEMAS)[K]>;

/**
 * The candidate field each kind's valid time is declared in — when an event
 * happened, or since when a fact holds — or null where it is the moment of
 * recording. Declared once, beside the candidates it names, so the runtime and
 * anything that asks a writer for a candidate date it by the same field.
 */
export const CANDIDATE_VALID_TIME = {
  working: null,
  episodic: 'occurredAt',
  semantic: 'validFrom',
  procedural: null,
  relational: 'validFrom',
} as const satisfies { [K in RegisterKind]: (keyof CandidateOf<K> & string) | null };

export const createSpaceRequestSchema = z.strictObject({ runId: ref(80) });

/** The most characters a space's name may run to: the width of the column that keeps it (`memory_space.name`). */
export const MEMORY_SPACE_NAME_MAX_LENGTH = 80;

/**
 * The grammar of a space's name: a lower-case word of letters, digits and
 * hyphens within the bound, so it reads the same in a path, a config file and
 * a log line. A space made by `POST /spaces` has none; another space holding
 * the name is `space.name_taken`.
 */
export const spaceNameSchema = z
  .string()
  .regex(
    new RegExp(`^[a-z][a-z0-9-]{0,${MEMORY_SPACE_NAME_MAX_LENGTH - 1}}$`),
    `a lower-case word of letters, digits and hyphens, ${MEMORY_SPACE_NAME_MAX_LENGTH} at most`,
  );

export const rememberRequestSchema = z.strictObject({
  register: registerRef,
  scope: recordScopeSchema,
  candidate: z.unknown(),
  provenance: provenanceSchema,
  metadata: metadataSchema.default({}),
});

/** Supersede an addressed, current record; `metadata: null` keeps the record's own. */
export const updateRecordRequestSchema = z.strictObject({
  recordId: z.uuid(),
  scope: recordScopeSchema,
  candidate: z.unknown(),
  provenance: provenanceSchema,
  metadata: metadataSchema.nullable().default(null),
});

export const invalidateRecordRequestSchema = z.strictObject({
  recordId: z.uuid(),
  scope: recordScopeSchema,
  reason: bounded.text(bound(300), { min: 1 }),
});

/** A key routes exactly, a text by meaning; a time range filters every route and runs alone when nothing else is named. */
export const recallRecordsRequestSchema = z
  .strictObject({
    scope: recordScopeSchema,
    registers: bounded.list(bound(8, 'list'), registerRef, { min: 1 }).nullable().default(null),
    key: ref(160).nullable().default(null),
    text: bounded.text(bound(1000), { min: 1 }).nullable().default(null),
    since: instantSchema.nullable().default(null),
    until: instantSchema.nullable().default(null),
    where: metadataSchema.default({}),
  })
  .refine(
    (request) =>
      request.key !== null ||
      request.text !== null ||
      request.since !== null ||
      request.until !== null,
    'a recall names a key, a text or a time range',
  )
  .refine(
    (request) =>
      request.since === null ||
      request.until === null ||
      Date.parse(request.since) < Date.parse(request.until),
    'since precedes until',
  );

export const consolidateRequestSchema = z.strictObject({ scope: recordScopeSchema });

export const recordHistoryRequestSchema = z.strictObject({
  recordId: z.uuid(),
  scope: recordScopeSchema,
});

export interface MemoryProvenanceDto {
  source: string;
  sourceRunId: string | null;
  /** The records this one was derived from — the episodes a lesson cites, the lessons a playbook holds. */
  derivedFrom: Uuid[];
}

export interface MemoryRecordDto {
  id: Uuid;
  register: string;
  kind: RegisterKind;
  scope: RecordScope;
  /** The identity a write reconciles on; null for a kind that appends. */
  identity: string | null;
  /** The values an exact recall finds it by. */
  keys: string[];
  body: Record<string, unknown>;
  metadata: Record<string, string>;
  text: string;
  status: RecordStatus;
  version: number;
  supersedesId: Uuid | null;
  /** Shared by every version of one identity, so a history reads them all. */
  lineageId: Uuid;
  validFrom: IsoDateString;
  validTo: IsoDateString | null;
  recordedAt: IsoDateString;
  expiresAt: IsoDateString | null;
  closedAt: IsoDateString | null;
  closeReason: string | null;
  support: number;
  provenance: MemoryProvenanceDto;
  projected: boolean;
}

export interface WriteResultDto {
  outcome: WriteOutcome;
  record: MemoryRecordDto;
  superseded: MemoryRecordDto | null;
  projected: boolean;
}

export interface RecallRouteDto {
  route: RecallRoute;
  registers: string[];
  hits: number;
  /** Index hits Postgres no longer holds current, unexpired and visible. */
  dropped: number;
  skipped: RouteSkip | null;
}

export interface RecallFactorsDto {
  similarity: number;
  exact: number;
  recency: number;
  support: number;
}

export interface RecalledRecordDto {
  record: MemoryRecordDto;
  score: number;
  factors: RecallFactorsDto;
  routes: RecallRoute[];
}

export interface RecallResultDto {
  items: RecalledRecordDto[];
  routes: RecallRouteDto[];
  /** Ranked memories the declared budget left out. */
  omitted: number;
}

export interface ConsolidationEntryDto {
  scope: RecordScope;
  key: string;
  outcome: ConsolidationOutcome;
  recordId: Uuid | null;
  support: number;
  version: number | null;
}

export interface ConsolidationResultDto {
  groups: number;
  lessons: ConsolidationEntryDto[];
  playbooks: ConsolidationEntryDto[];
}

export interface CompileIssueDto {
  code: CompileProblem | CompileWarning;
  refs: string[];
  message: string;
}

export interface CompiledRegisterDto {
  name: string;
  kind: RegisterKind;
  term: MemoryTerm;
  ttlSeconds: number | null;
  projected: boolean;
  operations: OperationVerb[];
  metadataFields: string[];
}

export interface CompileReportDto {
  problems: CompileIssueDto[];
  warnings: CompileIssueDto[];
  registers: CompiledRegisterDto[];
  consolidation: { sources: string[]; lessons: string; playbooks: string | null } | null;
}

export interface MemorySpaceDto {
  id: Uuid;
  /** The name it was ensured under; null for a space made by `POST /spaces`. */
  name: string | null;
  designRunId: string;
  policySource: string;
  /** The scope keys of the policy snapshot it keeps, the first the partition: what a request to it may name. */
  scopeKeys: string[];
  createdAt: IsoDateString;
  report: CompileReportDto;
}

/** What an ensure answered: the space under the name, and whether this call made it. */
export interface EnsuredSpaceDto {
  space: MemorySpaceDto;
  created: boolean;
}

/** A register a writer may remember into, and how it files what it keeps. */
export interface WritableRegisterDto {
  name: string;
  kind: RegisterKind;
  term: MemoryTerm;
  /** What the space's strategy says the register holds. */
  holds: string;
  /** The candidate fields a current value is one per; empty for a kind that appends. */
  identity: string[];
  /**
   * Identity values the register keeps for what consolidation writes into it.
   * A memory that takes one reconciles with, and replaces, consolidation's of
   * the same identity, and the write path does not refuse it: a writer is told
   * them so it takes none.
   */
  reserved: { field: string; value: string }[];
}

/** What a writer is told before it remembers into a space: every register it may write. */
export interface SpaceWriteBriefDto {
  registers: WritableRegisterDto[];
}

export interface MemoryRefusalDto {
  code: MemoryRefusal;
  message: string;
  issues: ApiValidationIssue[];
}
