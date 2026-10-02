import type {
  LlmExchangeSummaryDto,
  QualityRunDto,
  RunTrace,
  StopReason,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import type { GitContext } from '@sysdesign/run-dump';

/**
 * A run as it stands after an iteration: its trace as the wire carries it
 * while the run is running — everything the settled trace will say except
 * why the loop stopped, which it has not yet. `bestIteration` and
 * `finalDecision` are the loop's standing as of the last iteration recorded.
 */
export type RunProgress<T = unknown> = RunTrace<T> & { stopReason: null };

/**
 * A trace the loop closed with its stop reason — as opposed to progress: a
 * running run's iterations so far, or what a run that threw had recorded.
 * Only a settled trace has a verdict to write over what progress recorded.
 */
export const isSettled = <T>(
  trace: RunTrace<T> | null,
): trace is RunTrace<T> & { stopReason: StopReason } => trace !== null && trace.stopReason !== null;

/**
 * One run as the service holds it and the dump stores it: the wire shape plus
 * git and the full exchanges. Its `trace` follows the wire's rule — the
 * progress so far while it runs, the settled trace once it completes, and
 * the last progress it published if it fails.
 */
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
  attempt,
  error,
}: LlmExchange): LlmExchangeSummaryDto => ({
  scope,
  ordinal,
  outcome,
  durationMs,
  startedAt,
  attempt: attempt ?? 1,
  errorName: error?.name ?? null,
});

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
