/**
 * The input codec. An experience record is a finished run reduced to the
 * facts the engine established — what was found, what was acted on, what
 * changed between iterations — around the run's own prompt and artifact,
 * verbatim. This file renders that record as the goal every stage reads and
 * reads its own bookkeeping back from the last fenced JSON block.
 */
import {
  AXIS_FACTOR_LEVELS,
  CRITERION_RESULTS,
  DECISIONS,
  FIXABILITIES,
  MAX_QUALITY_RUN_ITERATIONS,
  PRODUCE_MODES,
  SEVERITIES,
  STOP_REASONS,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { GOAL_MAX_BYTES } from '../../core/contracts';

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
const STATEMENT_MAX = 300;
const RULE_MAX = 300;
const MAX_RULES = 8;

export const EVIDENCE_KINDS = ['finding', 'criterion'] as const;
const TRANSITION_KINDS = ['persisted', 'resolved', 'improved', 'regressed'] as const;

const alias = z.string().min(1).max(8);
const iteration = z.number().int().min(1);
const score = z.number().nullable();

const transitionSchema = z.strictObject({
  kind: z.enum(TRANSITION_KINDS),
  iterations: z.array(iteration).min(2).max(2),
  detail: z.string().max(120),
});
export type Transition = z.infer<typeof transitionSchema>;

const iterationSummarySchema = z.strictObject({
  iteration,
  mode: z.enum([...PRODUCE_MODES, 'provided'] as const),
  decision: z.enum(DECISIONS),
  reason: z.string().max(REASON_MAX),
  overall: z.number(),
  overallDelta: score,
  dimensions: z.record(z.string().max(40), score),
  dimensionDeltas: z.record(z.string().max(40), score),
});
export type IterationSummary = z.infer<typeof iterationSummarySchema>;

export const recordedCriterionSchema = z.strictObject({
  alias,
  id: z.string().min(1).max(20),
  kind: z.string().min(1).max(60),
  statement: z.string().min(1).max(STATEMENT_MAX),
  results: z
    .array(
      z.strictObject({ iteration, result: z.enum([...CRITERION_RESULTS, 'unassessed'] as const) }),
    )
    .max(MAX_QUALITY_RUN_ITERATIONS),
  transitions: z.array(transitionSchema).max(MAX_QUALITY_RUN_ITERATIONS),
});
export type RecordedCriterion = z.infer<typeof recordedCriterionSchema>;

export const recordedFindingSchema = z.strictObject({
  alias,
  key: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  severity: z.enum(SEVERITIES),
  confidence: z.enum(AXIS_FACTOR_LEVELS),
  fixability: z.enum(FIXABILITIES),
  locationRefs: z.array(z.string().max(40)).max(8),
  /** Aliases of the record's criteria the finding weakened. */
  criteria: z.array(alias).max(4),
  lenses: z.array(z.string().max(40)).max(6),
  iterations: z.array(iteration).min(1).max(MAX_QUALITY_RUN_ITERATIONS),
  rationale: z.string().max(RATIONALE_MAX).nullable(),
  /** The policy selected it for remediation in at least one iteration. */
  remediated: z.boolean(),
  reconciledTo: alias.nullable(),
  transitions: z.array(transitionSchema).max(MAX_QUALITY_RUN_ITERATIONS),
});
export type RecordedFinding = z.infer<typeof recordedFindingSchema>;

const recordShape = z.strictObject({
  runId: z.string().min(1).max(80),
  pipeline: z.string().min(1).max(120),
  finalDecision: z.enum(DECISIONS),
  stopReason: z.enum(STOP_REASONS),
  bestIteration: iteration,
  prompt: z.string().min(1).max(PROMPT_MAX),
  artifact: z.string().max(ARTIFACT_MAX).nullable(),
  iterations: z.array(iterationSummarySchema).min(1).max(MAX_QUALITY_RUN_ITERATIONS),
  criteria: z.array(recordedCriterionSchema).max(MAX_CRITERIA_ITEMS),
  findings: z.array(recordedFindingSchema).max(MAX_FINDINGS),
  omitted: z.strictObject({ findings: z.number().int().min(0), criteria: z.number().int().min(0) }),
  rules: z.array(z.string().min(1).max(RULE_MAX)).max(MAX_RULES),
  maxMemories: z.number().int().min(1).max(MAX_MEMORIES),
});
export type ExperienceRecord = z.infer<typeof recordShape>;

export const goalBytes = (goal: string): number => Buffer.byteLength(goal, 'utf8');

/**
 * The shape plus the one invariant the caps alone cannot state: a record must
 * render under the engine's goal budget, or every stage would read a clipped
 * goal while the validators read the whole one. `compose.ts` fits a record to
 * it; an orchestrator handing one over gets a refusal instead of a clip.
 */
export const experienceRecordSchema = recordShape.refine(
  (record) => goalBytes(renderGoal(record)) <= GOAL_MAX_BYTES,
  { message: `the record renders beyond the goal budget of ${GOAL_MAX_BYTES} bytes` },
);

/** Rules an orchestrator can state as they are; they guide the producer and the critics. */
export const DEFAULT_RULES: readonly string[] = [
  'A memory rests only on the findings and criteria it cites, and says only what they show.',
  'A memory claims a change in quality only where the record shows a transition or a score that moved.',
  'A memory states what to do or avoid in terms another prompt could use, and says when it applies.',
];

const indexSchema = z.strictObject({
  pipeline: z.literal(EXPERIENCE_DIGEST_ID),
  maxMemories: z.number().int().min(1),
  evidence: z.array(
    z.strictObject({ alias, kind: z.enum(EVIDENCE_KINDS), ref: z.string().min(1) }),
  ),
});
export type ExperienceIndex = z.infer<typeof indexSchema>;

const FENCE_OPEN = '```json\n';
const FENCE_CLOSE = '\n```';

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
    item.remediated ? 'remediated' : 'not remediated',
    item.reconciledTo ? `reconciled to ${item.reconciledTo}` : null,
    item.transitions.length > 0 ? transitionText(item.transitions) : null,
  ].filter((part): part is string => part !== null);
  return `- [${item.alias}] ${parts.join(' · ')}${item.rationale ? ` — ${item.rationale}` : ''}`;
};

const omittedLine = (count: number, noun: string): string[] =>
  count > 0 ? [`(${count} more ${noun} omitted)`] : [];

export function renderGoal(record: ExperienceRecord): string {
  const index: ExperienceIndex = {
    pipeline: EXPERIENCE_DIGEST_ID,
    maxMemories: record.maxMemories,
    evidence: [
      ...record.findings.map((f) => ({ alias: f.alias, kind: 'finding' as const, ref: f.key })),
      ...record.criteria.map((c) => ({ alias: c.alias, kind: 'criterion' as const, ref: c.id })),
    ],
  };
  const single = record.iterations.length === 1;
  return [
    '# Source prompt',
    '',
    record.prompt.trim(),
    '',
    '## Outcome',
    '',
    `- Run ${record.runId} of ${record.pipeline}: final decision ${record.finalDecision}, stopped by ${record.stopReason}, best iteration i${record.bestIteration}.`,
    ...(single
      ? ['- One iteration only: no transition exists, so no change in quality can be claimed.']
      : []),
    ...record.iterations.map(
      (it) =>
        `- i${it.iteration} (${it.mode}): ${it.decision} — overall ${it.overall}${signed(it.overallDelta)} — ${scoreLine(it)} — ${it.reason}`,
    ),
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
    `${FENCE_OPEN}${JSON.stringify(index)}${FENCE_CLOSE}`,
  ].join('\n');
}

/** The index this codec wrote, or null for a goal that is not an experience record. */
export function readIndex(goal: string): ExperienceIndex | null {
  const open = goal.lastIndexOf(FENCE_OPEN);
  if (open < 0) return null;
  const start = open + FENCE_OPEN.length;
  const close = goal.indexOf(FENCE_CLOSE, start);
  if (close < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(goal.slice(start, close));
  } catch {
    return null;
  }
  const result = indexSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
