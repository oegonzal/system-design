/**
 * What a recall searches for beyond its prompt: the defects of the iteration
 * a run starts from. A coach revises a design that has been judged, so the
 * lessons worth handing it are the ones about what is wrong with that design
 * now — and a recall over the prompt alone ranks lessons by how much they
 * resemble the problem statement, not the defects. Read from the iteration's
 * ledger as the engine confirmed it, worst first; nothing here judges.
 *
 * The focus becomes probes of its own, searched beside the goal, and a
 * delimited section of the curator's query. It never reaches a judge: the
 * coach's lenses are briefed by the engine, which knows nothing of recall.
 */
import {
  SEVERITIES,
  tokenWords,
  type CriterionEvidence,
  type IterationTrace,
  type RecallFocusCriterionDto,
  type RecallFocusDto,
  type RecallFocusFindingDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import { annotate } from '../../../core/evidence/annotate';
import { MAX_FOCUS, PROBE_MAX } from '../../../pipelines/memory-recall/input';

/**
 * How many of each a focus names. The recorded canvas iterations
 * (2026-09-28 → 2026-10-02) confirmed up to 13 findings and fell short on up
 * to 13 criteria; every one named is searched, so the worst are kept — as
 * many in all as the curator's query takes (`MAX_FOCUS`, one per lesson it
 * may keep), most of them defects, since a finding says what to fix and a
 * criterion only where it fell short.
 */
export const MAX_FOCUS_FINDINGS = 5;
export const MAX_FOCUS_CRITERIA = MAX_FOCUS - MAX_FOCUS_FINDINGS;

/** One focus line, as searched and as the curator reads it: a probe's length. */
export const FOCUS_LINE_MAX = PROBE_MAX;

/** The iteration a run starts from, with the rubric it was judged against. */
export interface RecallBase {
  runId: string;
  iteration: IterationTrace;
  criteria: readonly SuccessCriterion[];
}

const cap = (text: string): string => capText(text.trim(), FOCUS_LINE_MAX).text;

/** Short of a pass, worst first: a fail before a partial. */
const SHORTFALL_ORDER: readonly RecallFocusCriterionDto['result'][] = ['fail', 'partial'];

const isShortfall = (
  row: CriterionEvidence,
): row is CriterionEvidence & { result: RecallFocusCriterionDto['result'] } =>
  (SHORTFALL_ORDER as readonly string[]).includes(row.result);

/** The defects of the iteration a run starts from, worst first, within the caps. */
export function focusOf(base: RecallBase): RecallFocusDto {
  const { iteration } = base;
  // A finding carries the words its lens gave it; one recorded before it
  // did is read from the critics' own reports.
  const annotated = annotate(iteration.ledger.findings, iteration.critics, iteration.locations);
  const findings: RecallFocusFindingDto[] = iteration.ledger.findings
    .map((finding, position) => ({
      finding: {
        ...finding,
        rationale: finding.rationale ?? annotated[position]?.rationale ?? null,
      },
      position,
    }))
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(a.finding.severity) - SEVERITIES.indexOf(b.finding.severity) ||
        a.position - b.position,
    )
    .slice(0, MAX_FOCUS_FINDINGS)
    .map(({ finding }) => ({
      type: finding.type,
      severity: finding.severity,
      rationale: finding.rationale === null ? null : cap(finding.rationale),
    }));
  const statementOf = new Map(
    base.criteria.map((criterion) => [criterion.id, criterion.statement]),
  );
  const criteria: RecallFocusCriterionDto[] = iteration.ledger.criteria
    .filter(isShortfall)
    .map((row, position) => ({ row, position }))
    .sort(
      (a, b) =>
        SHORTFALL_ORDER.indexOf(a.row.result) - SHORTFALL_ORDER.indexOf(b.row.result) ||
        a.position - b.position,
    )
    .slice(0, MAX_FOCUS_CRITERIA)
    .map(({ row }) => ({
      criterionId: row.criterionId,
      statement: cap(statementOf.get(row.criterionId) ?? row.criterionId),
      result: row.result,
    }));
  return { runId: base.runId, iteration: iteration.iteration, findings, criteria };
}

/**
 * The focus as lines — each a probe the store is searched with and an item of
 * the curator's section: a defect in words with its severity and why, a
 * criterion with how it fell short and what it asks.
 */
export function focusLines(focus: RecallFocusDto | null): string[] {
  if (focus === null) return [];
  return [
    ...focus.findings.map(({ type, severity, rationale }) =>
      cap(`${tokenWords(type)} (${severity})${rationale ? `: ${rationale}` : ''}`),
    ),
    ...focus.criteria.map(({ criterionId, result, statement }) =>
      cap(`${criterionId} ${result}: ${statement}`),
    ),
  ].filter((line) => line.length > 0);
}
