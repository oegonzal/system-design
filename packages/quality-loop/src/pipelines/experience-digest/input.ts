/**
 * The input codec. An experience record is a finished run reduced to the
 * facts the engine established — what was found, what was acted on, what
 * changed between iterations — around the run's own prompt and artifact,
 * verbatim. This file renders that record as the goal every stage reads and
 * reads its own bookkeeping back from the last fenced JSON block.
 */
import { bound, bounded, renderIndexSection } from '@sysdesign/contracts';
import { z } from 'zod';

import { GOAL_MAX_BYTES, goalBytes, readFencedIndex } from '../../core/contracts';
import {
  ADOPTED_FINDING_NOTE,
  ALIAS_MAX,
  ARTIFACT_MAX,
  KEY_MAX,
  LENS_MAX,
  MAX_CRITERIA_ITEMS,
  MAX_EVIDENCE,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_LENSES,
  MAX_FINDING_REFS,
  MAX_FINDINGS,
  PROMPT_MAX,
  RATIONALE_MAX,
  REASON_MAX,
  RECORD_EVIDENCE_KINDS,
  REF_MAX,
  STATEMENT_MAX,
  TRANSITION_DETAIL_MAX,
  adoptedOmittedLines,
  experienceShape,
  recordedCriterionSchema,
  recordedFindingSchema,
  type IterationSummary,
  type RecordedCriterion,
  type RecordedFinding,
  type Transition,
} from '../../core/outputs';

export const EXPERIENCE_DIGEST_ID = 'experience-digest';

/** How many memories this digest may propose; the record's own caps are the engine's. */
export const MAX_MEMORIES = 8;
const RULE_MAX = 300;
const MAX_RULES = 8;
const RULE_BOUND = bound(RULE_MAX);
const RULES_BOUND = bound(MAX_RULES, 'list');

/**
 * The record's shape, caps and item schemas are `core/outputs`': two pipelines
 * digest a run and must read the same account of it. They are re-exported here
 * so this codec stays the one place a reader of the experience digest looks,
 * and `EVIDENCE_KINDS` keeps the name every stage of this pipeline already uses
 * for what a record's items may rest on.
 */
export {
  ALIAS_MAX,
  ARTIFACT_MAX,
  KEY_MAX,
  LENS_MAX,
  MAX_CRITERIA_ITEMS,
  MAX_EVIDENCE,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_LENSES,
  MAX_FINDING_REFS,
  MAX_FINDINGS,
  PROMPT_MAX,
  RATIONALE_MAX,
  REASON_MAX,
  REF_MAX,
  STATEMENT_MAX,
  TRANSITION_DETAIL_MAX,
  recordedCriterionSchema,
  recordedFindingSchema,
  RECORD_EVIDENCE_KINDS as EVIDENCE_KINDS,
};
export type { IterationSummary, RecordedCriterion, RecordedFinding, Transition };

/** The alias every index entry is addressed by, bounded as the record's are. */
const alias = bounded.id(ALIAS_MAX, { min: 1 });
const iteration = z.number().int().min(1);

const recordShape = experienceShape.extend({
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
      kind: z.enum(RECORD_EVIDENCE_KINDS),
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
    item.adopted ? ADOPTED_FINDING_NOTE : null,
    item.remediated ? 'remediated' : 'not remediated',
    item.reconciledTo ? `reconciled to ${item.reconciledTo}` : null,
    item.transitions.length > 0 ? transitionText(item.transitions) : null,
  ].filter((part): part is string => part !== null);
  return `- [${item.alias}] ${parts.join(' · ')}${item.rationale ? ` — ${item.rationale}` : ''}`;
};

const omittedLine = (count: number, noun: string): string[] =>
  count > 0 ? [`(${count} more ${noun} omitted)`] : [];

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
    ...adoptedOmittedLines(record.omitted.adopted),
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
    renderIndexSection(indexOf(record)),
  ].join('\n');
}

/** The index this codec wrote, or null for a goal that is not an experience record. */
export const readIndex = (goal: string): ExperienceIndex | null =>
  readFencedIndex(goal, indexSchema);
