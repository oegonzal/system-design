import type { IterationTrace, OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import type { LoopClient } from './loop-client';
import { LoopRunLost, LoopRunStale } from './loop-errors';

/** How often a caller asks after a run it is waiting on; the studio's pace. */
export const DEFAULT_POLL_EVERY_MS = 3_000;

export interface AwaitOptions {
  pollEveryMs?: number;
  /** The loop's stale window; read from `/health` when not given. */
  staleAfterMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface Pacing {
  pollEveryMs: number;
  staleAfterMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  signal: AbortSignal | undefined;
}

async function pacing(client: LoopClient, options: AwaitOptions): Promise<Pacing> {
  return {
    pollEveryMs: options.pollEveryMs ?? DEFAULT_POLL_EVERY_MS,
    staleAfterMs: options.staleAfterMs ?? (await client.health()).heartbeat.staleAfterMs,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? defaultSleep,
    signal: options.signal,
  };
}

/** A killed run keeps saying `running`; its heartbeat is what stops moving. */
const stale = (run: Pick<QualityRunDto, 'heartbeatAt'>, pace: Pacing): boolean =>
  pace.now() - Date.parse(run.heartbeatAt) > pace.staleAfterMs;

/**
 * The run once it has settled. Liveness is judged by the heartbeat against
 * the loop's own stale window, never by the exchange count or the status —
 * both lie for the whole window after a process dies. A run the loop no longer
 * has is `LoopRunLost`; one whose beat has stopped is `LoopRunStale`.
 */
export async function awaitRun(
  client: LoopClient,
  runId: string,
  options: AwaitOptions = {},
): Promise<QualityRunDto> {
  const pace = await pacing(client, options);
  for (;;) {
    pace.signal?.throwIfAborted();
    const run = await client.getRun(runId);
    if (run === null) throw new LoopRunLost(runId);
    if (run.status !== 'running') return run;
    if (stale(run, pace)) throw new LoopRunStale(runId, run.heartbeatAt, pace.staleAfterMs);
    await pace.sleep(pace.pollEveryMs);
  }
}

/** The child run an orchestration is working through right now, if a step has opened one. */
const liveChildOf = (orchestration: OrchestrationRunDto): string | null => {
  for (const step of Object.values(orchestration.steps)) {
    if (step.status === 'running' && step.runIds.length > 0) {
      return step.runIds[step.runIds.length - 1];
    }
  }
  return null;
};

/**
 * The orchestration once it has settled. The record has no heartbeat of its
 * own, so liveness is read off the child run its running step has open; a
 * step between runs is given the stale window from the last observation.
 */
export async function awaitOrchestration(
  client: LoopClient,
  orchestrationRunId: string,
  options: AwaitOptions = {},
): Promise<OrchestrationRunDto> {
  const pace = await pacing(client, options);
  let quietSince = pace.now();
  for (;;) {
    pace.signal?.throwIfAborted();
    const orchestration = await client.getOrchestration(orchestrationRunId);
    if (orchestration === null) throw new LoopRunLost(orchestrationRunId);
    if (orchestration.status !== 'running') return orchestration;
    const childId = liveChildOf(orchestration);
    if (childId !== null) {
      const child = await client.getRun(childId);
      if (child !== null && child.status === 'running' && stale(child, pace)) {
        throw new LoopRunStale(childId, child.heartbeatAt, pace.staleAfterMs);
      }
      quietSince = pace.now();
    } else if (pace.now() - quietSince > pace.staleAfterMs) {
      throw new LoopRunStale(
        orchestrationRunId,
        new Date(quietSince).toISOString(),
        pace.staleAfterMs,
      );
    }
    await pace.sleep(pace.pollEveryMs);
  }
}

/** The iteration the run judged best, looked up by its number — never by its index. */
export function bestIterationOf(run: QualityRunDto): IterationTrace | null {
  const trace = run.trace;
  if (trace === null) return null;
  return trace.iterations.find((it) => it.iteration === trace.bestIteration) ?? null;
}

/** The best iteration's artifact as the schema reads it, or null when there is none that fits. */
export function bestArtifact<T>(run: QualityRunDto, schema: ZodType<T>): T | null {
  const best = bestIterationOf(run);
  if (best === null || best.artifact === null) return null;
  const parsed = schema.safeParse(best.artifact);
  return parsed.success ? parsed.data : null;
}
