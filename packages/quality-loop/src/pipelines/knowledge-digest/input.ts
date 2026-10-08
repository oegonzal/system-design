/**
 * The input codec. A knowledge record is the engine's own reduction of a
 * finished run (`core/outputs/experience-record`) plus four things this digest
 * needs and the experience digest does not:
 *
 * - **what is already known**, so an item can be written as a delta — a run
 *   that teaches what the store holds confirms it instead of restating it,
 *   which is the difference between a corpus that grows and one that repeats;
 * - **the dimension map** of the source pipeline's policy, so an item's
 *   dimension is one its own evidence lands on and a validator can say so
 *   exactly, rather than a model naming a dimension nobody declared;
 * - **the artifact's location ids** and the iteration count, which together
 *   with the aliases are the vocabulary an item may not borrow: the
 *   run-specificity rule is a lookup against this list, never a pattern over
 *   prose;
 * - the rules and the item cap, as every composed goal carries.
 *
 * This file renders that record as the goal every stage reads and reads its own
 * bookkeeping back from the last fenced JSON block.
 */
import {
  MAX_QUALITY_RUN_ITERATIONS,
  renderIndexSection,
  TRANSITION_KINDS,
  GOAL_BUDGET_BYTES,
  textBytes,
  readFencedIndex,
} from '@sysdesign/contracts';
import { z } from 'zod';

import {
  ADOPTED_FINDING_NOTE,
  ALIAS_MAX,
  RECORD_EVIDENCE_KINDS,
  REF_MAX,
  adoptedOmittedLines,
  experienceShape,
  omittedShape,
  type RecordedCriterion,
  type RecordedFinding,
  type Transition,
} from '../../core/outputs';

export const KNOWLEDGE_DIGEST_ID = 'knowledge-digest';

/**
 * How many items this digest may propose. Twelve rather than the experience
 * digest's eight: its cap bound in 78 of 94 recorded digests, and an item that
 * only confirms what is known costs a reader nothing, so a lower cap would
 * spend slots on restatement.
 */
export const MAX_ITEMS = 12;
/** How many known items the digest is shown. Past this the goal grows faster than the delta it buys. */
export const MAX_KNOWN = 12;
/** A known item's text as the digest reads it; stored lessons run a median 525 characters. */
export const KNOWN_TEXT_MAX = 600;
/** The artifact's location ids, which the generality rule reads; a canvas renders about sixty. */
export const MAX_LOCATION_IDS = 256;
export const DIMENSION_MAX = 40;
export const TOPIC_MAX = 40;
export const MAX_TOPICS = 6;
const RULE_MAX = 300;
const MAX_RULES = 8;

export const knownItemSchema = z.strictObject({
  /** `k1`, `k2` — engine-assigned, the position the recall handed it over in. */
  alias: z.string().min(1).max(ALIAS_MAX),
  /** The stored chunk's kind: a lesson, or one of the knowledge kinds. */
  kind: z.string().min(1).max(40),
  runId: z.string().min(1).max(80),
  ref: z.string().min(1).max(200),
  pipeline: z.string().min(1).max(80),
  when: z.string().min(1).max(40),
  text: z.string().min(1).max(KNOWN_TEXT_MAX),
});
export type KnownItem = z.infer<typeof knownItemSchema>;

/**
 * The source pipeline's policy, projected to the one question this digest asks
 * of it: which dimension does a criterion of this kind, or a finding of this
 * type, land on. Handed in as data by whoever composes the record, so the codec
 * reads no registry and branches on no pipeline id.
 */
export const dimensionMapSchema = z.strictObject({
  criterionKinds: z.record(z.string().min(1).max(60), z.string().min(1).max(DIMENSION_MAX)),
  findingTypes: z.record(z.string().min(1).max(60), z.string().min(1).max(DIMENSION_MAX)),
});
export type DimensionMap = z.infer<typeof dimensionMapSchema>;

const recordShape = experienceShape.extend({
  /** Whose policy the dimension map is, so a later reader can tell when it has moved. */
  source: z.strictObject({
    pipeline: z.string().min(1).max(80),
    version: z.string().min(1).max(40),
  }),
  /** The source pipeline's declared dimensions, in policy order: the only values an item may name. */
  dimensions: z.array(z.string().min(1).max(DIMENSION_MAX)).min(1),
  dimensionMap: dimensionMapSchema,
  known: z.array(knownItemSchema).max(MAX_KNOWN),
  /** Every location id the judged artifact rendered; an item may not borrow one. */
  locationIds: z.array(z.string().min(1).max(REF_MAX)).max(MAX_LOCATION_IDS),
  omitted: omittedShape.extend({
    /** Location ids past the cap: unchecked by the generality rule, so counted. */
    locations: z.number().int().min(0),
  }),
  rules: z.array(z.string().min(1).max(RULE_MAX)).max(MAX_RULES),
  maxMemories: z.number().int().min(1).max(MAX_ITEMS),
});

/**
 * The shape plus the one invariant the caps alone cannot state: a record must
 * render under the engine's goal budget, or every stage would read a clipped
 * goal while the validators read the whole one. `from-run.ts` fits a record to
 * it; a composer handing one over gets a refusal instead of a clip.
 */
export const knowledgeRecordSchema = recordShape.refine(
  (record) => textBytes(renderGoal(record)) <= GOAL_BUDGET_BYTES,
  { message: `the record renders beyond the goal budget of ${GOAL_BUDGET_BYTES} bytes` },
);
export type KnowledgeRecord = z.infer<typeof recordShape>;

/** Rules a composer can state as they are; they guide the producer and the critics. */
export const KNOWLEDGE_RULES: readonly string[] = [
  'An item rests only on the findings and criteria it cites, and says only what they show.',
  'An item claims a change in quality only where the record shows a transition or a score that moved; a procedure rests on a finding that resolved.',
  "An item is written in terms another prompt could use — no listed alias, location id, iteration number, or this run's own names and figures — and says when it applies.",
  'An item that teaches what a known item teaches names it under confirms instead of restating it; one the evidence shows to be wrong here names it under contradicts and states what holds.',
  'A fact is true with this design removed.',
];

export const alias = (position: number): string => `k${position + 1}`;

/** The vocabulary of this run, which an item may not borrow: its aliases, its iterations, its places. */
export interface RunVocabulary {
  evidence: string[];
  known: string[];
  iterations: string[];
  locations: string[];
}

const indexSchema = z.strictObject({
  pipeline: z.literal(KNOWLEDGE_DIGEST_ID),
  maxMemories: z.number().int().min(1),
  source: z.strictObject({ pipeline: z.string(), version: z.string() }),
  dimensions: z.array(z.string()),
  /** How many iterations the run had, which names the tokens `i1`…`iN`. */
  iterations: z.number().int().min(1).max(MAX_QUALITY_RUN_ITERATIONS),
  evidence: z.array(
    z.strictObject({
      alias: z.string().min(1),
      kind: z.enum(RECORD_EVIDENCE_KINDS),
      ref: z.string().min(1),
      /** The finding's type or the criterion's kind — what the dimension was read from. */
      of: z.string().min(1),
      /** The dimension it lands on under the source policy; null when the policy maps none. */
      dimension: z.string().nullable(),
      transitions: z.array(z.enum(TRANSITION_KINDS)),
      /** A criterion that passed in every iteration it was assessed in; always false for a finding. */
      held: z.boolean(),
    }),
  ),
  known: z.array(
    z.strictObject({
      alias: z.string().min(1),
      kind: z.string().min(1),
      runId: z.string().min(1),
      ref: z.string().min(1),
    }),
  ),
  locations: z.array(z.string().min(1)),
});
export type KnowledgeIndex = z.infer<typeof indexSchema>;

/** A criterion that passed in every iteration that judged it, and was judged at least once. */
export const heldThroughout = (criterion: RecordedCriterion): boolean => {
  const judged = criterion.results.filter((result) => result.result !== 'unassessed');
  return judged.length > 0 && judged.every((result) => result.result === 'pass');
};

const dimensionOfFinding = (finding: RecordedFinding, map: DimensionMap): string | null =>
  map.findingTypes[finding.type] ?? null;

const dimensionOfCriterion = (criterion: RecordedCriterion, map: DimensionMap): string | null =>
  map.criterionKinds[criterion.kind] ?? null;

/** The index the validators read back: every alias with what a rule needs to check it. */
const indexOf = (record: KnowledgeRecord): KnowledgeIndex => ({
  pipeline: KNOWLEDGE_DIGEST_ID,
  maxMemories: record.maxMemories,
  source: record.source,
  dimensions: [...record.dimensions],
  iterations: record.iterations.length,
  evidence: [
    ...record.findings.map((finding) => ({
      alias: finding.alias,
      kind: 'finding' as const,
      ref: finding.key,
      of: finding.type,
      dimension: dimensionOfFinding(finding, record.dimensionMap),
      transitions: finding.transitions.map((transition) => transition.kind),
      held: false,
    })),
    ...record.criteria.map((criterion) => ({
      alias: criterion.alias,
      kind: 'criterion' as const,
      ref: criterion.id,
      of: criterion.kind,
      dimension: dimensionOfCriterion(criterion, record.dimensionMap),
      transitions: criterion.transitions.map((transition) => transition.kind),
      held: heldThroughout(criterion),
    })),
  ],
  known: record.known.map((item) => ({
    alias: item.alias,
    kind: item.kind,
    runId: item.runId,
    ref: item.ref,
  })),
  locations: [...record.locationIds],
});

/** Every token of this run an item may not borrow, read from the index the goal carries. */
export const vocabularyOf = (index: KnowledgeIndex): RunVocabulary => ({
  evidence: index.evidence.map((item) => item.alias),
  known: index.known.map((item) => item.alias),
  iterations: Array.from({ length: index.iterations }, (_, position) => `i${position + 1}`),
  locations: [...index.locations],
});

const signed = (value: number | null): string =>
  value === null ? '' : ` (${value > 0 ? '+' : ''}${value})`;

const scoreLine = (summary: KnowledgeRecord['iterations'][number]): string =>
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

/** A criterion line, with the dimension its kind lands on and whether it held throughout. */
const criterionLine = (item: RecordedCriterion, map: DimensionMap): string => {
  const dimension = dimensionOfCriterion(item, map);
  const results = item.results.map((r) => `i${r.iteration} ${r.result}`).join(' → ');
  const transitions = item.transitions.length > 0 ? ` — ${transitionText(item.transitions)}` : '';
  const held = heldThroughout(item) ? ' · held throughout' : '';
  return `- [${item.alias}] ${item.kind} → ${dimension ?? 'no dimension'}${held} · ${item.statement} — ${results}${transitions}`;
};

/** A finding line, with the dimension its type lands on. */
const findingLine = (item: RecordedFinding, map: DimensionMap): string => {
  const dimension = dimensionOfFinding(item, map);
  const parts = [
    `${item.type} → ${dimension ?? 'no dimension'}`,
    `${item.severity} · confidence ${item.confidence} · ${item.fixability}`,
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

const knownLine = (item: KnownItem): string =>
  `- [${item.alias}] ${item.kind} · ${item.pipeline} · ${item.when} · run ${item.runId} · ref ${item.ref}: ${item.text}`;

const omittedLine = (count: number, noun: string): string[] =>
  count > 0 ? [`(${count} more ${noun} omitted)`] : [];

/** What the run decided, iteration by iteration; one iteration alone can claim no change. */
const outcomeLines = (record: KnowledgeRecord): string[] => [
  `- Run ${record.runId} of ${record.pipeline}: final decision ${record.finalDecision}, stopped by ${record.stopReason}, best iteration i${record.bestIteration}.`,
  ...(record.iterations.length === 1
    ? ['- One iteration only: no transition exists, so no change in quality can be claimed.']
    : []),
  ...record.iterations.map(
    (it) =>
      `- i${it.iteration} (${it.mode}): ${it.decision} — overall ${it.overall}${signed(it.overallDelta)} — ${scoreLine(it)} — ${it.reason}`,
  ),
];

/**
 * The heading the already-known items sit under. Deliberately not the marker
 * `bareGoal` strips: this section is part of the record a digest judges, not
 * memory appended to someone else's prompt.
 */
export const KNOWN_HEADING = '## Already known';
const KNOWN_LEAD =
  'What the store already holds about situations like this run, recalled before the digest. An item of your own that teaches what one of these teaches names it under confirms rather than restating it; one the record contradicts names it under contradicts and says what holds instead. A known item the record does not bear on is left alone.';

export function renderGoal(record: KnowledgeRecord): string {
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
    ...(record.criteria.length > 0
      ? record.criteria.map((item) => criterionLine(item, record.dimensionMap))
      : ['(none)']),
    ...omittedLine(record.omitted.criteria, 'criteria'),
    '',
    '## Findings',
    '',
    ...(record.findings.length > 0
      ? record.findings.map((item) => findingLine(item, record.dimensionMap))
      : ['(none confirmed)']),
    ...omittedLine(record.omitted.findings, 'findings'),
    ...adoptedOmittedLines(record.omitted.adopted),
    '',
    KNOWN_HEADING,
    '',
    KNOWN_LEAD,
    '',
    ...(record.known.length > 0
      ? record.known.map(knownLine)
      : ['(none recalled — every item here is new to the store)']),
    '',
    '## Rules',
    '',
    ...(record.rules.length > 0 ? record.rules.map((rule) => `- ${rule}`) : ['(none)']),
    '',
    '## Limits',
    '',
    `- Propose at most ${record.maxMemories} items, each resting on 1–8 of the listed evidence aliases.`,
    '- Give every listed evidence alias exactly one place: under an item or under unused.',
    `- dimension is exactly one of: ${record.dimensions.join(', ')} — the dimension one of the item's own cited aliases lands on, as its line shows.`,
    '- kind is one of: fact, anti_pattern, pattern, procedure. A procedure rests on a finding whose transition says resolved; a pattern on a criterion that held throughout or a finding that resolved; an anti_pattern on a finding.',
    `- At most ${MAX_TOPICS} topics per item, each a general word a reader would search by.`,
    '- Validators check these limits; they are not criteria.',
    '',
    renderIndexSection(indexOf(record)),
  ].join('\n');
}

/** The index this codec wrote, or null for a goal that is not a knowledge record. */
export const readIndex = (goal: string): KnowledgeIndex | null =>
  readFencedIndex(goal, indexSchema);
