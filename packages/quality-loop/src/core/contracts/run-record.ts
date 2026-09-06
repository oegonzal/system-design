import type { LlmExchangeSummaryDto, QualityRunDto } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import type { GitContext } from '@sysdesign/run-dump';

/** One run as the service holds it and the dump stores it: the wire shape plus git and the full exchanges. */
export interface RunRecord extends Omit<QualityRunDto, 'exchanges'> {
  git: GitContext;
  exchanges: LlmExchange[];
}

export const summariseExchange = ({
  scope,
  ordinal,
  outcome,
  durationMs,
  startedAt,
}: LlmExchange): LlmExchangeSummaryDto => ({ scope, ordinal, outcome, durationMs, startedAt });

/** The wire projection, picked field by field: prompts, responses and git stay in the dump. */
export function toRunDto(record: RunRecord): QualityRunDto {
  const { runId, pipeline, status, startedAt, finishedAt, llm, request, trace, error } = record;
  return {
    runId,
    pipeline,
    status,
    startedAt,
    finishedAt,
    llm,
    request,
    trace,
    error,
    exchanges: record.exchanges.map(summariseExchange),
  };
}
