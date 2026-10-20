import type { PracticeFormat, SuccessCriterion } from '@sysdesign/contracts';

/**
 * Which criteria the interviewer probes in a deep dive, chosen without a
 * model: the criteria the candidate's brief has not bound come first, then
 * the bound ones, each group ordered by the format's emphasis — a kind the
 * format leans on before one it does not — and then by the rubric's own
 * order; as many as the format's `probes` declares. Deterministic, so the
 * same design draws the same questions.
 */
export function deepDiveTargets(
  criteria: readonly SuccessCriterion[],
  boundCriterionIds: Iterable<string>,
  format: PracticeFormat,
): SuccessCriterion[] {
  const bound = new Set(boundCriterionIds);
  const emphasis = (criterion: SuccessCriterion): number => {
    const rank = (format.emphasis as readonly string[]).indexOf(criterion.kind);
    return rank < 0 ? format.emphasis.length : rank;
  };
  const ordered = [...criteria]
    .map((criterion, position) => ({ criterion, position }))
    .sort(
      (a, b) =>
        Number(bound.has(a.criterion.id)) - Number(bound.has(b.criterion.id)) ||
        emphasis(a.criterion) - emphasis(b.criterion) ||
        a.position - b.position,
    )
    .map(({ criterion }) => criterion);
  return ordered.slice(0, format.probes);
}
