/**
 * A finished run reduced to the facts the engine established: what was found,
 * what was acted on, what changed between iterations, around the run's own
 * prompt and artifact verbatim. Shape, caps and reducer, with no opinion about
 * what reads it.
 *
 * This lives in `core/outputs/` because more than one pipeline digests a run
 * and they must reduce it the same way — a second copy of the folding would
 * drift, and the two digests would then be learning from different accounts of
 * the same run. What stays with each codec is how the record is rendered as a
 * goal, what rules travel with it, and what else it carries; this file ends at
 * the facts.
 *
 * Nothing here judges. Deltas between iterations are the one figure computed,
 * and they come from the decisions' own scores.
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
  ITERATION_MODES,
  MAX_QUALITY_RUN_ITERATIONS,
  SEVERITIES,
  STOP_REASONS,
  TRANSITION_KINDS,
  type ConfirmedFinding,
  type IterationTrace,
  type Lesson,
  type QualityRunDto,
  type RunTrace,
  textBytes,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';
import { z } from 'zod';

import { round1 } from '../arithmetic';
import { annotate } from '../evidence/annotate';
import { outputsOf } from './run-outputs';

/** Caps chosen so a maximal record renders well under the engine's goal budget. */
export const MAX_FINDINGS = 32;
export const MAX_CRITERIA_ITEMS = 24;
export const MAX_EVIDENCE = MAX_FINDINGS + MAX_CRITERIA_ITEMS;
export const PROMPT_MAX = 12_000;
export const ARTIFACT_MAX = 16_000;
export const RATIONALE_MAX = 200;
export const REASON_MAX = 200;
export const STATEMENT_MAX = 300;
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
 * The record is composed (`experienceOf`), never written by a model: each text
 * is capped where it is composed at its bound's target, and each list sliced
 * to its count, so the counts are exact and the prose is bounded — a record
 * another composer hands over a little past a target is still a record.
 */
const PROMPT_BOUND = bound(PROMPT_MAX);
const ARTIFACT_BOUND = bound(ARTIFACT_MAX);
const RATIONALE_BOUND = bound(RATIONALE_MAX);
const REASON_BOUND = bound(REASON_MAX);
const STATEMENT_BOUND = bound(STATEMENT_MAX);
const TRANSITION_DETAIL_BOUND = bound(TRANSITION_DETAIL_MAX);
const PER_ITERATION_BOUND = exact(MAX_QUALITY_RUN_ITERATIONS);
const TRANSITION_ENDS_BOUND = exact(2);
const FINDINGS_BOUND = exact(MAX_FINDINGS);
const CRITERIA_BOUND = exact(MAX_CRITERIA_ITEMS);
const FINDING_REFS_BOUND = exact(MAX_FINDING_REFS);
const FINDING_CRITERIA_BOUND = exact(MAX_FINDING_CRITERIA);
const FINDING_LENSES_BOUND = exact(MAX_FINDING_LENSES);

/** What a run's record offers an item to rest on: its confirmed findings and its judged criteria. */
export const RECORD_EVIDENCE_KINDS = ['finding', 'criterion'] as const;

const alias = bounded.id(ALIAS_MAX, { min: 1 });
const iteration = z.number().int().min(1);
const score = z.number().nullable();
const dimension = bounded.id(DIMENSION_MAX);

export const transitionSchema = z.strictObject({
  kind: z.enum(TRANSITION_KINDS),
  iterations: bounded.list(TRANSITION_ENDS_BOUND, iteration, { min: 2 }),
  detail: bounded.text(TRANSITION_DETAIL_BOUND),
});
export type Transition = z.infer<typeof transitionSchema>;

export const iterationSummarySchema = z.strictObject({
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

/**
 * The facts themselves. A codec extends this with what its own stages read —
 * the rules that travel with the record, how many items it may propose, and
 * anything else it hands the model.
 */
/**
 * What the record left out, counted: findings and criteria past their caps or
 * the goal budget, and findings seen only in an adopted iteration with no
 * transition — copies of an earlier run's evidence this run changed nothing
 * about, which that run's own digest already read. A codec that leaves out
 * more extends it.
 */
export const omittedShape = z.strictObject({
  findings: z.number().int().min(0),
  criteria: z.number().int().min(0),
  adopted: z.number().int().min(0),
});

/** How a record's reader is told a finding was confirmed by an earlier run's judges. */
export const ADOPTED_FINDING_NOTE = 'adopted from an earlier run';

/** The line a render gives the adopted findings a record left out; nothing when it left none. */
export const adoptedOmittedLines = (count: number): string[] =>
  count > 0
    ? [
        `(${count} more findings omitted: seen only in an iteration adopted from an earlier run, with no change this run judged)`,
      ]
    : [];

export const experienceShape = z.strictObject({
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
  omitted: omittedShape,
});
export type Experience = z.infer<typeof experienceShape>;

const delta = (now: number | null, before: number | null | undefined): number | null =>
  now === null || before === null || before === undefined ? null : round1(now - before);

const cap = (value: string, max: number): string => capText(value, max).text;

const transitionsFor = (lessons: readonly Lesson[], subject: string): Transition[] =>
  lessons
    .filter((lesson) => lesson.subject === subject)
    .map((lesson) => ({
      kind: lesson.kind,
      iterations: [lesson.iterations[0], lesson.iterations[1]],
      detail: cap(lesson.detail, TRANSITION_DETAIL_MAX),
    }));

function summarise(iterations: readonly IterationTrace[]): IterationSummary[] {
  return iterations.map((current, index) => {
    const previous = index > 0 ? iterations[index - 1].decision.scores : null;
    const { scores } = current.decision;
    return {
      iteration: current.iteration,
      mode: current.mode,
      decision: current.decision.finalDecision,
      reason: cap(current.decision.reason, REASON_MAX),
      overall: scores.overall,
      overallDelta: previous ? delta(scores.overall, previous.overall) : null,
      dimensions: { ...scores.dimensions },
      dimensionDeltas: Object.fromEntries(
        Object.entries(scores.dimensions).map(([dimension, value]) => [
          dimension,
          previous ? delta(value, previous.dimensions[dimension]) : null,
        ]),
      ),
    };
  });
}

/**
 * The first sentence any critic gave for a confirmed finding in that
 * iteration, capped — read from the critics' own reports, so a run recorded
 * before findings carried their words is served the same way.
 */
const rationaleFor = (iteration: IterationTrace, finding: ConfirmedFinding): string | null => {
  const [annotated] = annotate([finding], iteration.critics, iteration.locations);
  return annotated.rationale === null ? null : cap(annotated.rationale, RATIONALE_MAX);
};

/** Whether the policy selected the finding for remediation in that iteration. */
const remediatedIn = (iteration: IterationTrace, key: string): boolean =>
  iteration.decision.selectedRemediations.some(
    (remediation) => 'finding' in remediation.subject && remediation.subject.finding === key,
  );

type Unaliased = Omit<RecordedFinding, 'alias' | 'adopted'>;

/** A finding as first seen, before any iteration has been folded into it. */
const fresh = (
  finding: ConfirmedFinding,
  aliasOf: (id: string) => string,
  lessons: readonly Lesson[],
): Unaliased => ({
  key: finding.key,
  type: finding.type,
  severity: finding.severity,
  confidence: finding.confidence,
  fixability: finding.fixability,
  // The record declares both bounds and nothing parses it at runtime, so they
  // are held here. A canvas finding routinely spans a dozen refs — the widest
  // few are the ones a reader needs, and the line is what a digest reads.
  locationRefs: finding.locationRefs.slice(0, MAX_FINDING_REFS),
  criteria: finding.criterionIds.slice(0, MAX_FINDING_CRITERIA).map(aliasOf),
  lenses: [...finding.lenses],
  iterations: [],
  rationale: null,
  remediated: false,
  reconciledTo: null,
  transitions: transitionsFor(lessons, finding.key),
});

/**
 * Acted-on findings first, then the worst, then the earliest: under the cap,
 * the signals a digest must account for are the ones that stay.
 */
const byPriority = (a: Unaliased, b: Unaliased): number =>
  Number(b.remediated) - Number(a.remediated) ||
  SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
  a.iterations[0] - b.iterations[0];

/** The iterations whose ledger was copied verbatim from an earlier run rather than judged in this one. */
const adoptedIterations = (trace: RunTrace): ReadonlySet<number> =>
  new Set(
    trace.iterations
      .filter((iteration) => iteration.mode === 'adopted')
      .map((iteration) => iteration.iteration),
  );

/**
 * Whether a finished run holds no evidence of its own: it adopted an
 * iteration, and no iteration it did not adopt holds an artifact — so every
 * judged finding and criterion in it is a copy of an earlier run's ledger,
 * which that run's own digest already read. A digest of it could only mint
 * those lessons again. Read off the iterations' modes and ledgers alone.
 */
export function teachesNothingNew(trace: RunTrace): boolean {
  const adopted = adoptedIterations(trace);
  return (
    adopted.size > 0 &&
    trace.iterations.every(
      (iteration) => adopted.has(iteration.iteration) || !iteration.ledger.artifactPresent,
    )
  );
}

interface CollectedFindings {
  findings: RecordedFinding[];
  /** Seen only in an adopted iteration and never changed in this run: left out, counted. */
  adopted: number;
}

/**
 * Every confirmed finding across the iterations, folded by key, the latest
 * iteration's reading kept. A finding seen only in an adopted iteration was
 * confirmed by an earlier run's judges: it stays only when this run changed
 * it — a transition the engine recorded — and is marked adopted, so a memory
 * can rest on the change and never on the copied finding itself.
 */
function collectFindings(
  trace: RunTrace,
  criterionAlias: ReadonlyMap<string, string>,
): CollectedFindings {
  const byKey = new Map<string, Unaliased>();
  const aliasOf = (id: string): string => criterionAlias.get(id) ?? id;

  for (const iteration of trace.iterations) {
    for (const finding of iteration.ledger.findings) {
      const entry = byKey.get(finding.key) ?? fresh(finding, aliasOf, trace.lessons);
      byKey.set(finding.key, {
        ...entry,
        severity: finding.severity,
        confidence: finding.confidence,
        fixability: finding.fixability,
        lenses: [...finding.lenses],
        iterations: [...entry.iterations, iteration.iteration],
        rationale: entry.rationale ?? rationaleFor(iteration, finding),
        remediated: entry.remediated || remediatedIn(iteration, finding.key),
        reconciledTo: finding.reconciledTo ? aliasOf(finding.reconciledTo) : entry.reconciledTo,
      });
    }
  }
  const adoptedIn = adoptedIterations(trace);
  const ownIteration = (iteration: number): boolean => !adoptedIn.has(iteration);
  const folded = [...byKey.values()].map((finding) => ({
    ...finding,
    adopted: !finding.iterations.some(ownIteration),
  }));
  // A change is this run's when it reaches an iteration this run judged, not one it copied.
  const changedHere = (finding: Unaliased): boolean =>
    finding.transitions.some((transition) => transition.iterations.some(ownIteration));
  const kept = folded.filter((finding) => !finding.adopted || changedHere(finding));
  return {
    findings: kept
      .sort(byPriority)
      .map((finding, position) => ({ alias: `f${position + 1}`, ...finding })),
    adopted: folded.length - kept.length,
  };
}

function collectCriteria(trace: RunTrace): RecordedCriterion[] {
  return trace.contract.criteria.map((criterion, position) => ({
    alias: `r${position + 1}`,
    id: criterion.id,
    kind: criterion.kind,
    statement: cap(criterion.statement, STATEMENT_MAX),
    results: trace.iterations.map((iteration) => ({
      iteration: iteration.iteration,
      result:
        iteration.ledger.criteria.find((evidence) => evidence.criterionId === criterion.id)
          ?.result ?? 'unassessed',
    })),
    transitions: transitionsFor(trace.lessons, criterion.id),
  }));
}

/**
 * A finished run's facts, or null until it has settled a trace: a run still
 * going (its trace has no stop reason yet) or one that failed before the loop
 * teaches nothing yet.
 */
export function experienceOf(run: QualityRunDto): Experience | null {
  const { trace } = run;
  if (trace === null || trace.stopReason === null || trace.iterations.length === 0) return null;

  const criteria = collectCriteria(trace);
  const criterionAlias = new Map(criteria.map((criterion) => [criterion.id, criterion.alias]));
  const { findings, adopted } = collectFindings(trace, criterionAlias);
  const best = outputsOf(trace).best ?? trace.iterations[trace.iterations.length - 1];

  return {
    runId: run.runId,
    pipeline: `${trace.pipeline.id}@${trace.pipeline.version}`,
    finalDecision: trace.finalDecision,
    stopReason: trace.stopReason,
    bestIteration: best.iteration,
    prompt: cap(trace.contract.goal, PROMPT_MAX),
    artifact: best.rendered === null ? null : cap(best.rendered, ARTIFACT_MAX),
    iterations: summarise(trace.iterations),
    criteria: criteria.slice(0, MAX_CRITERIA_ITEMS),
    findings: findings.slice(0, MAX_FINDINGS),
    omitted: {
      findings: Math.max(0, findings.length - MAX_FINDINGS),
      criteria: Math.max(0, criteria.length - MAX_CRITERIA_ITEMS),
      adopted,
    },
  };
}

/** Below this, trimming the text loses more than dropping evidence would. */
const TEXT_FLOOR = 2_000;

const halve = (text: string): string => cap(text, Math.floor(textBytes(text) / 2));

/**
 * The cheapest single trim left over the facts: the artifact text, then the
 * prompt, then a trailing finding, then a trailing criterion — each drop
 * counted under `omitted`. Null when there is nothing left to drop. A codec
 * that carries more than the facts tries its own cheaper trims first and falls
 * back to this.
 */
export function trimExperience<R extends Experience>(record: R): R | null {
  if (record.artifact !== null && textBytes(record.artifact) > TEXT_FLOOR) {
    return { ...record, artifact: halve(record.artifact) };
  }
  if (textBytes(record.prompt) > TEXT_FLOOR) return { ...record, prompt: halve(record.prompt) };
  if (record.findings.length > 0) {
    return {
      ...record,
      findings: record.findings.slice(0, -1),
      omitted: { ...record.omitted, findings: record.omitted.findings + 1 },
    };
  }
  if (record.criteria.length > 0) {
    return {
      ...record,
      criteria: record.criteria.slice(0, -1),
      omitted: { ...record.omitted, criteria: record.omitted.criteria + 1 },
    };
  }
  return null;
}

/**
 * Fit a record to a budget, deterministically, one cheapest trim at a time —
 * and give up rather than loop when the trim has nothing left to give. The
 * render is the codec's, because only the codec knows what the model will
 * read; the budget is measured over exactly that text.
 */
export function fitToBudget<R>(
  record: R,
  render: (record: R) => string,
  trim: (record: R) => R | null,
  budget: number,
): R {
  let current = record;
  while (textBytes(render(current)) > budget) {
    const trimmed = trim(current);
    if (trimmed === null) return current;
    current = trimmed;
  }
  return current;
}
