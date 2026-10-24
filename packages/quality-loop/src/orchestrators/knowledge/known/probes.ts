/**
 * What the store is asked about a finished run, with no model call.
 *
 * A recall for a goal needs a model to turn one problem statement into the
 * conditions it puts an answer in. This asks a different question — what does
 * the store already know about *this run's own evidence* — and the engine has
 * already decomposed that: every confirmed finding of the judged iteration is a
 * defect in words, and every criterion is a situation in words. Those are the
 * two registers the store indexes, so the probes are the evidence itself. The
 * form recall is the precedent: a page's own field labels, searched as they are.
 *
 * Nothing here judges, and nothing here reads prose: the lines are assembled
 * from recorded fields, worst first, and capped.
 */
import {
  KNOWLEDGE_ITEM_KINDS,
  SEVERITIES,
  tokenWords,
  type ConfirmedFinding,
  type CriterionEvidence,
  type IterationTrace,
  type RunTrace,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import { annotate } from '../../../core/evidence/annotate';
import { MAX_KNOWN } from '../../../pipelines/knowledge-digest/input';
import { PROBE_BOUND } from '../../../pipelines/memory-recall/input';
import { fuse } from '../../memory/recall/fusion';
import {
  VECTOR_NAMES,
  type MemoryHit,
  type MemoryProbe,
  type ProbeFilter,
} from '../../memory/ports';

/**
 * How many of the run's own lines are searched. Past this the batch costs more
 * than the coverage it buys: the recorded canvas iterations confirmed up to 13
 * findings against up to 13 criteria, so this reaches both in full.
 */
export const MAX_KNOWN_PROBES = 24;
/** How many hits one line may contribute, per named vector, before fusion. */
export const KNOWN_PER_PROBE = 4;

/** A line is capped at the target a probe is asked for, as a recall's own probes are. */
const cap = (text: string): string => capText(text.trim(), PROBE_BOUND.target).text;

/** Worst first, then in the order the ledger recorded them. */
const bySeverity = (a: ConfirmedFinding, b: ConfirmedFinding): number =>
  SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);

/** Short of a pass first: what went wrong is what the store is most likely to know about. */
const SHORTFALL_FIRST: readonly CriterionEvidence['result'][] = ['fail', 'partial'];
const byShortfall = (a: CriterionEvidence, b: CriterionEvidence): number =>
  SHORTFALL_FIRST.indexOf(b.result) - SHORTFALL_FIRST.indexOf(a.result);

/**
 * One line per confirmed finding of the iteration, in the register a defect is
 * written in — the same shape a focused recall searches with, so a finding chunk
 * and a focus line meet as like with like.
 */
export function findingLines(iteration: IterationTrace): string[] {
  const annotated = annotate(iteration.ledger.findings, iteration.critics, iteration.locations);
  return iteration.ledger.findings
    .map((finding, position) => ({
      finding,
      rationale: finding.rationale ?? annotated[position]?.rationale ?? null,
    }))
    .sort((a, b) => bySeverity(a.finding, b.finding))
    .map(({ finding, rationale }) =>
      cap(
        `${tokenWords(finding.type)} (${finding.severity})${rationale === null ? '' : `: ${rationale}`}`,
      ),
    );
}

/** One line per judged criterion, in the register a condition is written in. */
export function criterionLines(
  iteration: IterationTrace,
  criteria: readonly SuccessCriterion[],
): string[] {
  const statementOf = new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));
  return [...iteration.ledger.criteria]
    .sort(byShortfall)
    .map((row) => cap(`${row.result}: ${statementOf.get(row.criterionId) ?? row.criterionId}`));
}

/**
 * Every line the store is asked about, defects before conditions, deduped and
 * bounded. Empty when the judged iteration has neither — a run with no evidence
 * has nothing to ask about, which the step reports rather than searching for
 * nothing.
 */
export function knownProbes(trace: RunTrace): string[] {
  const iteration =
    trace.iterations.find((candidate) => candidate.iteration === trace.bestIteration) ??
    trace.iterations[trace.iterations.length - 1];
  if (iteration === undefined) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of [
    ...findingLines(iteration),
    ...criterionLines(iteration, trace.contract.criteria),
  ]) {
    if (line.length === 0 || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length === MAX_KNOWN_PROBES) break;
  }
  return lines;
}

/**
 * What the search will consider: knowledge and lessons, never this run's own
 * points. Excluding the source run is load-bearing — on a re-run its own items
 * would come back as "already known" and the digest would confirm itself.
 * `finding` chunks are left out too: they are this corpus's record of what was
 * seen, not a claim a digest should write a delta against.
 */
export const knownFilter = (sourceRunId: string): ProbeFilter => ({
  kinds: [...KNOWLEDGE_ITEM_KINDS, 'lesson'],
  notRunIds: [sourceRunId],
});

/** Every named vector of every line, as one batch, each line with the same budget and filter. */
export const probesOf = (
  vectors: readonly (readonly number[])[],
  filter: ProbeFilter,
): MemoryProbe[] =>
  vectors.flatMap((vector) =>
    VECTOR_NAMES.map((using) => ({ vector, using, limit: KNOWN_PER_PROBE, filter })),
  );

/** The ranked lists collapsed to one list, best-supported first, one per stored text. */
export const fuseKnown = (ranked: readonly (readonly MemoryHit[])[]): MemoryHit[] =>
  fuse(ranked, MAX_KNOWN);
