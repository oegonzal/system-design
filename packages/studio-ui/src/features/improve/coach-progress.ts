import type { ImproveRunDto } from '@sysdesign/contracts';

/**
 * Where a live coaching run is, in words: still recalling lessons from
 * earlier runs, which comes before anything else moves, or the iteration
 * under way out of its budget and the model calls so far — the one signal
 * that moves between iterations. The panel shows it and the polling hook
 * announces it.
 */
export function coachProgress(run: ImproveRunDto): string {
  if (run.recall?.status === 'recalling') {
    return 'Coaching — recalling lessons from earlier runs for the coach';
  }
  const current = Math.min(run.iterations.length + 1, run.maxIterations);
  const calls = `${run.exchangeCount} model ${run.exchangeCount === 1 ? 'call' : 'calls'}`;
  return `Coaching — iteration ${current} of ${run.maxIterations}, ${calls} so far`;
}
