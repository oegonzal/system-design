import type { DesignRevisionSummaryDto } from '@sysdesign/contracts';

const scoreOf = (revision: DesignRevisionSummaryDto): number =>
  revision.evaluation?.overall ?? Number.NEGATIVE_INFINITY;

/**
 * The best revision an earlier coaching run left in the timeline. The
 * coach's revisions are the assistant revisions, each pointing at the run
 * that graded it; the earlier run is the newest one other than `runId`, and
 * its best is its highest score, the earliest of equals — the rule
 * "Load improved design" applies to the run on screen. Null when no earlier
 * run imported anything.
 */
export function earlierRunBest(
  revisions: readonly DesignRevisionSummaryDto[],
  runId: string,
): DesignRevisionSummaryDto | null {
  const earlier = revisions
    .filter(
      (revision) =>
        revision.origin === 'assistant' &&
        revision.evaluation !== null &&
        revision.evaluation.runId !== runId,
    )
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
  const newest = earlier.at(-1);
  if (newest === undefined) return null;
  let best: DesignRevisionSummaryDto | null = null;
  for (const revision of earlier) {
    if (revision.evaluation?.runId !== newest.evaluation?.runId) continue;
    if (best === null || scoreOf(revision) > scoreOf(best)) best = revision;
  }
  return best;
}
