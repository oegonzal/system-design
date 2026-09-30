/** The list row: the header plus the two counts the repository supplies. */
import type { QualityRunSummaryDto } from '@sysdesign/contracts';

import { toIso, toIsoOrNull } from './conventions';
import type { QualityRunRow } from './rows';

export function toSummary(
  run: QualityRunRow,
  counts: { iterations: number; criteria: number },
): QualityRunSummaryDto {
  return {
    runId: run.id,
    pipeline: run.pipeline,
    pipelineVersion: run.pipelineVersion,
    status: run.status,
    startedAt: toIso(run.startedAt),
    finishedAt: toIsoOrNull(run.finishedAt),
    finalDecision: run.finalDecision,
    stopReason: run.stopReason,
    overall: run.overall,
    iterations: counts.iterations,
    criteria: counts.criteria,
    exchangeCount: run.exchangeCount,
    llm: run.llm,
  };
}
