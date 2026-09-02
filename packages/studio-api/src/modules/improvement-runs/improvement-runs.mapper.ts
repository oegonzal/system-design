import type { ImprovementRunDto } from '@sysdesign/contracts';
import type { ImprovementRun } from '@sysdesign/db';

/** Plain projection; base/best scores are derived client-side from the trajectory. */
export const toImprovementRunDto = (run: ImprovementRun): ImprovementRunDto => ({
  id: run.id,
  sessionId: run.session.id,
  baseRevisionId: run.baseRevision.id,
  bestRevisionId: run.bestRevision?.id ?? null,
  status: run.status,
  maxIterations: run.maxIterations,
  iterations: run.iterations,
  stoppedReason: run.stoppedReason,
  error: run.error,
  createdAt: run.createdAt.toISOString(),
  updatedAt: run.updatedAt.toISOString(),
});
