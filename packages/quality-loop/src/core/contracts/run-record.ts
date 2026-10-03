import type {
  LlmExchangeSummaryDto,
  OverrunHandling,
  QualityRunDto,
  RunTrace,
  StopReason,
} from '@sysdesign/contracts';
import type { LlmExchange, LlmSalvage } from '@sysdesign/llm';
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

/** How many of a call's overruns were handled a given way. */
const handled = (salvage: LlmSalvage | null | undefined, ...ways: OverrunHandling[]): number =>
  salvage?.overruns.filter((overrun) => ways.includes(overrun.handling)).length ?? 0;

/**
 * One exchange as the wire carries it: the salvage by count — every field
 * past its target, those past the ceiling however handled, those cut and
 * those trimmed — with the fields themselves left to the dump. A record
 * written before the seam salvaged reads as a call that kept nothing.
 */
export const summariseExchange = ({
  scope,
  ordinal,
  outcome,
  durationMs,
  startedAt,
  attempt,
  error,
  salvage,
  apiCalls,
}: LlmExchange): LlmExchangeSummaryDto => ({
  scope,
  ordinal,
  outcome,
  durationMs,
  startedAt,
  attempt: attempt ?? 1,
  errorName: error?.name ?? null,
  overruns: salvage?.overruns.length ?? 0,
  overCeiling: handled(salvage, 'kept-over-ceiling', 'cut', 'trimmed'),
  cut: handled(salvage, 'cut'),
  trimmed: handled(salvage, 'trimmed'),
  salvagedFrom: salvage?.from ?? null,
  feedback: salvage?.feedback ?? false,
  apiCalls: apiCalls ?? null,
});

/** The wire projection, picked field by field: prompts, responses and git stay in the dump. */
export function toRunDto(record: RunRecord): QualityRunDto {
  const {
    runId,
    pipeline,
    status,
    startedAt,
    finishedAt,
    heartbeatAt,
    llm,
    request,
    parentRunId,
    recall,
    trace,
    error,
  } = record;
  return {
    runId,
    pipeline,
    status,
    startedAt,
    finishedAt,
    heartbeatAt,
    llm,
    request,
    parentRunId,
    recall,
    trace,
    error,
    exchanges: record.exchanges.map(summariseExchange),
  };
}
