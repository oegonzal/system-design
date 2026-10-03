/**
 * The input codec. An experience record is a finished run reduced to the
 * facts the engine established — what was found, what was acted on, what
 * changed between iterations — around the run's own prompt and artifact,
 * verbatim. This file renders that record as the goal every stage reads and
 * reads its own bookkeeping back from the last fenced JSON block.
 */
import {
  AXIS_FACTOR_LEVELS,
  bound,
  bounded,
  CRITERION_ID_MAX_LENGTH,
  CRITERION_KIND_MAX_LENGTH,
  CRITERION_RESULTS,
  DECISIONS,
  exact,
  FIXABILITIES,
  MAX_QUALITY_RUN_ITERATIONS,
  ITERATION_MODES,
  SEVERITIES,
  STOP_REASONS,
} from '@sysdesign/contracts';
import { z } from 'zod';

import {
  FENCE_CLOSE,
  FENCE_OPEN,
  GOAL_MAX_BYTES,
  goalBytes,
  readFencedIndex,
} from '../../core/contracts';

export const EXPERIENCE_DIGEST_ID = 'experience-digest';

/** Caps chosen so a maximal record renders well under the engine's goal budget. */
export const MAX_MEMORIES = 8;
export const MAX_FINDINGS = 32;
export const MAX_CRITERIA_ITEMS = 24;
export const MAX_EVIDENCE = MAX_FINDINGS + MAX_CRITERIA_ITEMS;
export const PROMPT_MAX = 12_000;
export const ARTIFACT_MAX = 16_000;
export const RATIONALE_MAX = 200;
export const REASON_MAX = 200;
export const STATEMENT_MAX = 300;
const RULE_MAX = 300;
const MAX_RULES = 8;
/** An evidence alias — `f12`, `r3` — and the engine ids a finding carries. */
export const ALIAS_MAX = 8;
export const KEY_MAX = 200;
export const REF_MAX = 40;
export const LENS_MAX = 40;
export const TRANSITION_DETAIL_MAX = 120;
/** How many locations, criteria and lenses one recorded finding lists. */
export const MAX_FINDING_REFS = 8;
export const MAX_FINDING_CRITERIA = 4;
export const MAX_FINDING_LENSES = 6;

const FINDING_TYPE_MAX = 60;
const DIMENSION_MAX = 40;
const RUN_ID_MAX = 80;
const PIPELINE_ID_MAX = 120;

/*
 * The record is composed (`from-run.ts`), never written by a model: each text
 * is capped where it is composed at its bound's target, and each list sliced
 * to its count, so the counts are exact and the prose is bounded — a record
 * another composer hands over a little past a target is still a record.
 */
const PROMPT_BOUND = bound(PROMPT_MAX);
const ARTIFACT_BOUND = bound(ARTIFACT_MAX);
const RATIONALE_BOUND = bound(RATIONALE_MAX);
const REASON_BOUND = bound(REASON_MAX);
const STATEMENT_BOUND = bound(STATEMENT_MAX);
const RULE_BOUND = bound(RULE_MAX);
const RULES_BOUND = bound(MAX_RULES, 'list');
const TRANSITION_DETAIL_BOUND = bound(TRANSITION_DETAIL_MAX);
const PER_ITERATION_BOUND = exact(MAX_QUALITY_RUN_ITERATIONS);
const TRANSITION_ENDS_BOUND = exact(2);
const FINDINGS_BOUND = exact(MAX_FINDINGS);
const CRITERIA_BOUND = exact(MAX_CRITERIA_ITEMS);
const FINDING_REFS_BOUND = exact(MAX_FINDING_REFS);
const FINDING_CRITERIA_BOUND = exact(MAX_FINDING_CRITERIA);
const FINDING_LENSES_BOUND = exact(MAX_FINDING_LENSES);

export const EVIDENCE_KINDS = ['finding', 'criterion'] as const;
const TRANSITION_KINDS = ['persisted', 'resolved', 'improved', 'regressed'] as const;

const alias = bounded.id(ALIAS_MAX, { min: 1 });
const iteration = z.number().int().min(1);
const score = z.number().nullable();
const dimension = bounded.id(DIMENSION_MAX);

const transitionSchema = z.strictObject({
  kind: z.enum(TRANSITION_KINDS),
  iterations: bounded.list(TRANSITION_ENDS_BOUND, iteration, { min: 2 }),
  detail: bounded.text(TRANSITION_DETAIL_BOUND),
});
export type Transition = z.infer<typeof transitionSchema>;

const iterationSummarySchema = z.strictObject({
  iteration,
  mode: z.enum(ITERATION_MODES),
  decision: z.enum(DECISIONS),
  reason: bounded.text(REASON_BOUND),
  overall: z.number(),
  overallDelta: score,
  dimensions: z.record(dimension, score),
  dimensionDeltas: z.record(dimension, score),
});
export type IterationSummary = z.infer<typeof iterationSummarySchema>;

export const recordedCriterionSchema = z.strictObject({
  alias,
  id: bounded.id(CRITERION_ID_MAX_LENGTH, { min: 1 }),
  kind: bounded.id(CRITERION_KIND_MAX_LENGTH, { min: 1 }),
  statement: bounded.text(STATEMENT_BOUND, { min: 1 }),
  results: bounded.list(
    PER_ITERATION_BOUND,
    z.strictObject({ iteration, result: z.enum([...CRITERION_RESULTS, 'unassessed'] as const) }),
  ),
  transitions: bounded.list(PER_ITERATION_BOUND, transitionSchema),
});
export type RecordedCriterion = z.infer<typeof recordedCriterionSchema>;

export const recordedFindingSchema = z.strictObject({
  alias,
  key: bounded.id(KEY_MAX, { min: 1 }),
  type: bounded.id(FINDING_TYPE_MAX, { min: 1 }),
  severity: z.enum(SEVERITIES),
  confidence: z.enum(AXIS_FACTOR_LEVELS),
  fixability: z.enum(FIXABILITIES),
  locationRefs: bounded.list(FINDING_REFS_BOUND, bounded.id(REF_MAX)),
  /** Aliases of the record's criteria the finding weakened. */
  criteria: bounded.list(FINDING_CRITERIA_BOUND, alias),
  lenses: bounded.list(FINDING_LENSES_BOUND, bounded.id(LENS_MAX)),
  iterations: bounded.list(PER_ITERATION_BOUND, iteration, { min: 1 }),
  rationale: bounded.text(RATIONALE_BOUND).nullable(),
  /** The policy selected it for remediation in at least one iteration. */
  remediated: z.boolean(),
  reconciledTo: alias.nullable(),
  transitions: bounded.list(PER_ITERATION_BOUND, transitionSchema),
  /**
   * Seen only in an iteration adopted from an earlier run: that run's judges
   * confirmed it, and only its transitions are this run's own.
   */
  adopted: z.boolean(),
});
export type RecordedFinding = z.infer<typeof recordedFindingSchema>;

const recordShape = z.strictObject({
  runId: bounded.id(RUN_ID_MAX, { min: 1 }),
  pipeline: bounded.id(PIPELINE_ID_MAX, { min: 1 }),
  finalDecision: z.enum(DECISIONS),
  stopReason: z.enum(STOP_REASONS),
  bestIteration: iteration,
  prompt: bounded.text(PROMPT_BOUND, { min: 1 }),
  artifact: bounded.text(ARTIFACT_BOUND).nullable(),
  iterations: bounded.list(PER_ITERATION_BOUND, iterationSummarySchema, { min: 1 }),
  criteria: bounded.list(CRITERIA_BOUND, recordedCriterionSchema),
  findings: bounded.list(FINDINGS_BOUND, recordedFindingSchema),
  /**
   * What the record left out, counted: findings and criteria past their caps
   * or the goal budget, and findings seen only in an adopted iteration with no
   * transition — copies of an earlier run's evidence this run changed nothing
   * about, which that run's own digest already read.
   */
  omitted: z.strictObject({
    findings: z.number().int().min(0),
    criteria: z.number().int().min(0),
    adopted: z.number().int().min(0),
  }),
  rules: bounded.list(RULES_BOUND, bounded.text(RULE_BOUND, { min: 1 })),
  maxMemories: z.number().int().min(1).max(MAX_MEMORIES),
});
export type ExperienceRecord = z.infer<typeof recordShape>;

/**
 * The shape plus the one invariant the caps alone cannot state: a record must
 * render under the engine's goal budget, or every stage would read a clipped
 * goal while the validators read the whole one. `from-run.ts` fits a record to
 * it; an orchestrator handing one over gets a refusal instead of a clip.
 */
export const experienceRecordSchema = recordShape.refine(
  (record) => goalBytes(renderGoal(record)) <= GOAL_MAX_BYTES,
  { message: `the record renders beyond the goal budget of ${GOAL_MAX_BYTES} bytes` },
);

/** Rules an orchestrator can state as they are; they guide the producer and the critics. */
export const DIGEST_RULES: readonly string[] = [
  'A memory rests only on the findings and criteria it cites, and says only what they show.',
  'A memory claims a change in quality only where the record shows a transition or a score that moved.',
  'A memory states what to do or avoid in terms another prompt could use, and says when it applies.',
  'A finding adopted from an earlier run was judged there: a memory rests on it only for what this run changed about it, as its transition shows.',
];

const indexSchema = z.strictObject({
  pipeline: z.literal(EXPERIENCE_DIGEST_ID),
  maxMemories: z.number().int().min(1),
  evidence: z.array(
    z.strictObject({
      alias,
      kind: z.enum(EVIDENCE_KINDS),
      ref: z.string().min(1),
      /**
       * The source run's iterations the item belongs to, ascending: where a
       * finding was seen or a criterion assessed, and both ends of every
       * change the record shows in it. A memory is stamped from what it
       * cites; an index written before carried none.
       */
      iterations: z.array(iteration).default([]),
    }),
  ),
});
export type ExperienceIndex = z.infer<typeof indexSchema>;

const signed = (value: number | null): string =>
  value === null ? '' : ` (${value > 0 ? '+' : ''}${value})`;

const scoreLine = (summary: IterationSummary): string =>
  Object.entries(summary.dimensions)
    .map(
      ([dimension, value]) =>
        `${dimension} ${value ?? 'n/a'}${signed(summary.dimensionDeltas[dimension] ?? null)}`,
    )
    .join(' · ');

const transitionText = (transitions: readonly Transition[]): string =>
  transitions
    .map((t) => `${t.kind} i${t.iterations[0]}→i${t.iterations[1]} (${t.detail})`)
    .join(', ');

const criterionLine = (item: RecordedCriterion): string => {
  const results = item.results.map((r) => `i${r.iteration} ${r.result}`).join(' → ');
  const transitions = item.transitions.length > 0 ? ` — ${transitionText(item.transitions)}` : '';
  return `- [${item.alias}] ${item.kind} · ${item.statement} — ${results}${transitions}`;
};

const findingLine = (item: RecordedFinding): string => {
  const parts = [
    `${item.type} · ${item.severity} · confidence ${item.confidence} · ${item.fixability}`,
    item.locationRefs.length > 0 ? `at ${item.locationRefs.join(', ')}` : 'artifact-wide',
    item.criteria.length > 0 ? `weakens ${item.criteria.join(', ')}` : null,
    `by ${item.lenses.join(', ')}`,
    `seen ${item.iterations.map((n) => `i${n}`).join(', ')}`,
    item.adopted ? 'adopted from an earlier run' : null,
    item.remediated ? 'remediated' : 'not remediated',
    item.reconciledTo ? `reconciled to ${item.reconciledTo}` : null,
    item.transitions.length > 0 ? transitionText(item.transitions) : null,
  ].filter((part): part is string => part !== null);
  return `- [${item.alias}] ${parts.join(' · ')}${item.rationale ? ` — ${item.rationale}` : ''}`;
};

const omittedLine = (count: number, noun: string): string[] =>
  count > 0 ? [`(${count} more ${noun} omitted)`] : [];

const adoptedLine = (count: number): string[] =>
  count > 0
    ? [
        `(${count} more findings omitted: seen only in an iteration adopted from an earlier run, with no change this run judged)`,
      ]
    : [];

/** Iterations ascending, each once: where an item stood, and both ends of each change in it. */
const iterationsOf = (stood: readonly number[], transitions: readonly Transition[]): number[] =>
  [...new Set([...stood, ...transitions.flatMap((transition) => transition.iterations)])].sort(
    (a, b) => a - b,
  );

/**
 * The index the validators read back: every alias, its kind, the engine id
 * behind it, and the iterations it belongs to — a finding where it was seen,
 * a criterion where it was assessed — so the store stamps each memory from
 * the iterations it cites.
 */
const indexOf = (record: ExperienceRecord): ExperienceIndex => ({
  pipeline: EXPERIENCE_DIGEST_ID,
  maxMemories: record.maxMemories,
  evidence: [
    ...record.findings.map((f) => ({
      alias: f.alias,
      kind: 'finding' as const,
      ref: f.key,
      iterations: iterationsOf(f.iterations, f.transitions),
    })),
    ...record.criteria.map((c) => ({
      alias: c.alias,
      kind: 'criterion' as const,
      ref: c.id,
      iterations: iterationsOf(
        c.results.filter((row) => row.result !== 'unassessed').map((row) => row.iteration),
        c.transitions,
      ),
    })),
  ],
});

/** What the run decided, iteration by iteration; one iteration alone can claim no change. */
const outcomeLines = (record: ExperienceRecord): string[] => [
  `- Run ${record.runId} of ${record.pipeline}: final decision ${record.finalDecision}, stopped by ${record.stopReason}, best iteration i${record.bestIteration}.`,
  ...(record.iterations.length === 1
    ? ['- One iteration only: no transition exists, so no change in quality can be claimed.']
    : []),
  ...record.iterations.map(
    (it) =>
      `- i${it.iteration} (${it.mode}): ${it.decision} — overall ${it.overall}${signed(it.overallDelta)} — ${scoreLine(it)} — ${it.reason}`,
  ),
];

export function renderGoal(record: ExperienceRecord): string {
  return [
    '# Source prompt',
    '',
    record.prompt.trim(),
    '',
    '## Outcome',
    '',
    ...outcomeLines(record),
    '',
    `## Artifact (best iteration i${record.bestIteration})`,
    '',
    record.artifact === null ? '(no artifact was produced)' : record.artifact.trim(),
    '',
    '## Criteria',
    '',
    ...(record.criteria.length > 0 ? record.criteria.map(criterionLine) : ['(none)']),
    ...omittedLine(record.omitted.criteria, 'criteria'),
    '',
    '## Findings',
    '',
    ...(record.findings.length > 0 ? record.findings.map(findingLine) : ['(none confirmed)']),
    ...omittedLine(record.omitted.findings, 'findings'),
    ...adoptedLine(record.omitted.adopted),
    '',
    '## Rules',
    '',
    ...(record.rules.length > 0 ? record.rules.map((rule) => `- ${rule}`) : ['(none)']),
    '',
    '## Limits',
    '',
    `- Propose at most ${record.maxMemories} memories, each resting on 1–4 of the listed aliases.`,
    '- Give every listed alias exactly one place: under a memory or under unused.',
    '- Validators check these limits; they are not criteria.',
    '',
    '## Index',
    '',
    `${FENCE_OPEN}${JSON.stringify(indexOf(record))}${FENCE_CLOSE}`,
  ].join('\n');
}

/** The index this codec wrote, or null for a goal that is not an experience record. */
export const readIndex = (goal: string): ExperienceIndex | null =>
  readFencedIndex(goal, indexSchema);
