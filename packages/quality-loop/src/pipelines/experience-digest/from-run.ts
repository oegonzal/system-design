/**
 * A finished run → an experience record. Only facts the engine established:
 * which findings were confirmed, which the policy selected, what each
 * iteration decided and scored, and the transitions the lessons already
 * name. Deltas between iterations are the one figure computed here, from the
 * decisions' own scores. Nothing is judged; the pipeline's lenses do that.
 */
import {
  SEVERITIES,
  type ConfirmedFinding,
  type IterationTrace,
  type Lesson,
  type QualityRunDto,
  type RunTrace,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import { round1 } from '../../core/arithmetic';
import { GOAL_MAX_BYTES, goalBytes } from '../../core/contracts';
import { annotate } from '../../core/evidence/annotate';
import { outputsOf } from '../../core/outputs';
import {
  ARTIFACT_MAX,
  DIGEST_RULES,
  MAX_CRITERIA_ITEMS,
  MAX_FINDINGS,
  MAX_FINDING_CRITERIA,
  MAX_FINDING_REFS,
  MAX_MEMORIES,
  PROMPT_MAX,
  RATIONALE_MAX,
  REASON_MAX,
  renderGoal,
  STATEMENT_MAX,
  TRANSITION_DETAIL_MAX,
  type ExperienceRecord,
  type IterationSummary,
  type RecordedCriterion,
  type RecordedFinding,
  type Transition,
} from './input';

export interface ComposeOptions {
  maxMemories?: number;
  rules?: readonly string[];
}

const delta = (now: number | null, before: number | null | undefined): number | null =>
  now === null || before === null || before === undefined ? null : round1(now - before);

const transitionsFor = (lessons: readonly Lesson[], subject: string): Transition[] =>
  lessons
    .filter((lesson) => lesson.subject === subject)
    .map((lesson) => ({
      kind: lesson.kind,
      iterations: [lesson.iterations[0], lesson.iterations[1]],
      detail: capText(lesson.detail, TRANSITION_DETAIL_MAX).text,
    }));

const cap = (value: string, max: number): string => capText(value, max).text;

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
  // few are the ones a reader needs, and the line is what the digest reads.
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
 * the signals the digest must account for are the ones that stay.
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

/** Below this, trimming the text loses more than dropping evidence would. */
const TEXT_FLOOR = 2_000;

const halve = (text: string): string => cap(text, Math.floor(goalBytes(text) / 2));

/**
 * The cheapest single trim left: the artifact text, then the prompt, then a
 * trailing finding, then a trailing criterion — each drop counted under
 * `omitted`. Null when there is nothing left to drop.
 */
function trimStep(record: ExperienceRecord): ExperienceRecord | null {
  if (record.artifact !== null && goalBytes(record.artifact) > TEXT_FLOOR) {
    return { ...record, artifact: halve(record.artifact) };
  }
  if (goalBytes(record.prompt) > TEXT_FLOOR) return { ...record, prompt: halve(record.prompt) };
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

/** Fit a record to the goal budget, deterministically, one cheapest trim at a time. */
export function fit(record: ExperienceRecord, budget = GOAL_MAX_BYTES): ExperienceRecord {
  let current = record;
  while (goalBytes(renderGoal(current)) > budget) {
    const trimmed = trimStep(current);
    if (trimmed === null) return current;
    current = trimmed;
  }
  return current;
}

/**
 * Null until the run has settled a trace: a run still going (its trace has
 * no stop reason yet) or one that failed before the loop teaches nothing yet.
 */
export function fromRun(run: QualityRunDto, options: ComposeOptions = {}): ExperienceRecord | null {
  const { trace } = run;
  if (trace === null || trace.stopReason === null || trace.iterations.length === 0) return null;

  const criteria = collectCriteria(trace);
  const criterionAlias = new Map(criteria.map((criterion) => [criterion.id, criterion.alias]));
  const { findings, adopted } = collectFindings(trace, criterionAlias);
  const best = outputsOf(trace).best ?? trace.iterations[trace.iterations.length - 1];

  return fit({
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
    rules: [...(options.rules ?? DIGEST_RULES)],
    maxMemories: options.maxMemories ?? MAX_MEMORIES,
  });
}
