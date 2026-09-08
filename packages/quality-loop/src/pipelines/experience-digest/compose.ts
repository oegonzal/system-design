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

import { admitRefs, sameDefect } from '../../core/normalize';
import { GOAL_MAX_BYTES } from '../../core/prompting';
import {
  ARTIFACT_MAX,
  DEFAULT_RULES,
  goalBytes,
  MAX_CRITERIA_ITEMS,
  MAX_FINDINGS,
  MAX_MEMORIES,
  PROMPT_MAX,
  RATIONALE_MAX,
  REASON_MAX,
  renderGoal,
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

const round1 = (value: number): number => Math.round(value * 10) / 10;

const delta = (now: number | null, before: number | null | undefined): number | null =>
  now === null || before === null || before === undefined ? null : round1(now - before);

const transitionsFor = (lessons: readonly Lesson[], subject: string): Transition[] =>
  lessons
    .filter((lesson) => lesson.subject === subject)
    .map((lesson) => ({
      kind: lesson.kind,
      iterations: [lesson.iterations[0], lesson.iterations[1]],
      detail: capText(lesson.detail, 120).text,
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
 * The first rationale any critic gave for a confirmed finding, in that
 * iteration. A confirmed finding groups several raw ones, so its key belongs to
 * the group rather than to any member: match by membership, not by key.
 */
function rationaleFor(iteration: IterationTrace, key: string): string | null {
  const confirmed = iteration.ledger.findings.find((finding) => finding.key === key);
  if (!confirmed) return null;
  const known = new Set(iteration.locations.map((location) => location.id));
  for (const outcome of iteration.critics) {
    for (const raw of outcome.report?.findings ?? []) {
      const here = { type: raw.type, locationRefs: admitRefs(raw.locationRefs, known) };
      if (sameDefect(confirmed, here)) return cap(raw.rationale, RATIONALE_MAX);
    }
  }
  return null;
}

type Unaliased = Omit<RecordedFinding, 'alias'>;

/**
 * Acted-on findings first, then the worst, then the earliest: under the cap,
 * the signals the digest must account for are the ones that stay.
 */
const byPriority = (a: Unaliased, b: Unaliased): number =>
  Number(b.remediated) - Number(a.remediated) ||
  SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
  a.iterations[0] - b.iterations[0];

function collectFindings(
  trace: RunTrace,
  criterionAlias: ReadonlyMap<string, string>,
): RecordedFinding[] {
  const byKey = new Map<string, Unaliased>();
  const aliasOf = (id: string): string => criterionAlias.get(id) ?? id;
  const remediatedIn = (iteration: IterationTrace, key: string): boolean =>
    iteration.decision.selectedRemediations.some(
      (remediation) => 'finding' in remediation.subject && remediation.subject.finding === key,
    );
  const fresh = (finding: ConfirmedFinding): Unaliased => ({
    key: finding.key,
    type: finding.type,
    severity: finding.severity,
    confidence: finding.confidence,
    fixability: finding.fixability,
    locationRefs: [...finding.locationRefs],
    criteria: finding.criterionIds.map(aliasOf),
    lenses: [...finding.lenses],
    iterations: [],
    rationale: null,
    remediated: false,
    reconciledTo: null,
    transitions: transitionsFor(trace.lessons, finding.key),
  });

  for (const iteration of trace.iterations) {
    for (const finding of iteration.ledger.findings) {
      const entry = byKey.get(finding.key) ?? fresh(finding);
      byKey.set(finding.key, {
        ...entry,
        severity: finding.severity,
        confidence: finding.confidence,
        fixability: finding.fixability,
        lenses: [...finding.lenses],
        iterations: [...entry.iterations, iteration.iteration],
        rationale: entry.rationale ?? rationaleFor(iteration, finding.key),
        remediated: entry.remediated || remediatedIn(iteration, finding.key),
        reconciledTo: finding.reconciledTo ? aliasOf(finding.reconciledTo) : entry.reconciledTo,
      });
    }
  }
  return [...byKey.values()]
    .sort(byPriority)
    .map((finding, position) => ({ alias: `f${position + 1}`, ...finding }));
}

function collectCriteria(trace: RunTrace): RecordedCriterion[] {
  return trace.contract.criteria.map((criterion, position) => ({
    alias: `r${position + 1}`,
    id: criterion.id,
    kind: criterion.kind,
    statement: cap(criterion.statement, 300),
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

/**
 * Fit a record to the goal budget, deterministically and in order of what
 * costs least to lose: the artifact text, then the prompt, then trailing
 * findings, then trailing criteria — each drop counted under `omitted`.
 */
export function fit(record: ExperienceRecord, budget = GOAL_MAX_BYTES): ExperienceRecord {
  let current = record;
  const halve = (text: string): string => cap(text, Math.floor(goalBytes(text) / 2));
  while (goalBytes(renderGoal(current)) > budget) {
    if (current.artifact !== null && goalBytes(current.artifact) > TEXT_FLOOR) {
      current = { ...current, artifact: halve(current.artifact) };
    } else if (goalBytes(current.prompt) > TEXT_FLOOR) {
      current = { ...current, prompt: halve(current.prompt) };
    } else if (current.findings.length > 0) {
      current = {
        ...current,
        findings: current.findings.slice(0, -1),
        omitted: { ...current.omitted, findings: current.omitted.findings + 1 },
      };
    } else if (current.criteria.length > 0) {
      current = {
        ...current,
        criteria: current.criteria.slice(0, -1),
        omitted: { ...current.omitted, criteria: current.omitted.criteria + 1 },
      };
    } else {
      return current;
    }
  }
  return current;
}

/** Null until the run has a trace: a running or failed-before-loop run teaches nothing yet. */
export function fromRun(run: QualityRunDto, options: ComposeOptions = {}): ExperienceRecord | null {
  const { trace } = run;
  if (trace === null || trace.iterations.length === 0) return null;

  const criteria = collectCriteria(trace);
  const criterionAlias = new Map(criteria.map((criterion) => [criterion.id, criterion.alias]));
  const findings = collectFindings(trace, criterionAlias);
  const best =
    trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ??
    trace.iterations[trace.iterations.length - 1];

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
    },
    rules: [...(options.rules ?? DEFAULT_RULES)],
    maxMemories: options.maxMemories ?? MAX_MEMORIES,
  });
}
