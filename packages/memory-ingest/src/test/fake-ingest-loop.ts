import type {
  OrchestrationRunDto,
  OrchestrationStepDto,
  RetractedMemoryRunDto,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { LoopIngestSink } from '../adapters/loop-http/loop-ingest-sink';
import { FIXED_NOW, storedSteps } from './fakes';

/**
 * The loop as the shared fake, behind the shipping sink — so a spec exercises
 * the adapter that ships, with the orchestrations settled by script instead of
 * by a model. Test code only: `@sysdesign/studio-testing` is for specs, and
 * this folder is outside the app build (`tsconfig.app.json`). One fake is one
 * loop and one store: a spec that ingests again does so through the same fake,
 * so no digest run id is minted twice.
 */

/** How the fake settles the orchestration a post is waiting on. */
export type SettleScript =
  | { steps: Record<string, Partial<OrchestrationStepDto>> }
  | { fail: string }
  /** The loop forgets the orchestration mid-wait, so the wait is lost. */
  | { lose: true };

/**
 * The shared fake client, plus a refusal a spec can arm for the next start, a
 * count of what was running when each start arrived, and the store's points
 * by digest run — what a retraction removes.
 */
export class ScriptedLoopClient extends FakeLoopClient {
  refuseNextStart: Error | null = null;
  /** Orchestrations still running at each start — all zeros when posting is truly one at a time. */
  readonly runningAtStart: number[] = [];
  /** Points the store holds by digest run, as each settle stored them; a retraction removes a run's once. */
  readonly points = new Map<string, number>();
  /** Retractions that fail, by digest run: each throws its error and removes nothing. */
  readonly failingRetractions = new Map<string, Error>();

  override startOrchestration(orchestrator: string, request: StartOrchestrationRequest) {
    if (this.refuseNextStart !== null) {
      const error = this.refuseNextStart;
      this.refuseNextStart = null;
      return Promise.reject(error);
    }
    this.runningAtStart.push(runningOrchestrations(this.core).length);
    return super.startOrchestration(orchestrator, request);
  }

  /** The shared fake records the retraction; the points it removes are this store's. */
  override async retractMemory(digestRunId: string): Promise<RetractedMemoryRunDto> {
    const failure = this.failingRetractions.get(digestRunId);
    if (failure !== undefined) throw failure;
    const answer = await super.retractMemory(digestRunId);
    const removed = this.points.get(digestRunId) ?? 0;
    this.points.delete(digestRunId);
    return { ...answer, removed };
  }
}

const runningOrchestrations = (loop: FakeLoop): OrchestrationRunDto[] =>
  [...loop.orchestrations.records.values()].filter((record) => record.status === 'running');

export interface FakeIngestLoop {
  loop: FakeLoop;
  client: ScriptedLoopClient;
  /** The real sink over the fake client; each wait's first sleep settles the orchestration by script. */
  sink: LoopIngestSink;
  /** What was started, in order. */
  posted: { orchestrator: string; request: StartOrchestrationRequest }[];
  /** Settle the postings yet to come by these, after any still queued — for a later run through the same fake. */
  script(...next: SettleScript[]): void;
}

/**
 * The sink's wait sleeps between polls; here a sleep settles the newest
 * running orchestration by the next script entry, so a post resolves on its
 * second read without a timer. With the script spent, a posting is stored
 * under a digest run of its own — `digest-run-1`, `digest-run-2`, … — and
 * whatever a settled store step took is held under its digest run.
 */
export function fakeIngestLoop(script: readonly SettleScript[] = []): FakeIngestLoop {
  const loop = new FakeLoop();
  const client = new ScriptedLoopClient(loop);
  const queue = [...script];
  let digests = 0;
  const sink = new LoopIngestSink(client, {
    pollEveryMs: 0,
    staleAfterMs: 180_000,
    now: () => Date.parse(FIXED_NOW),
    sleep: async () => {
      const running = runningOrchestrations(loop);
      const latest = running[running.length - 1];
      if (latest === undefined) return;
      const next = queue.shift() ?? { steps: storedSteps(`digest-run-${++digests}`) };
      if ('fail' in next) loop.orchestrations.fail(latest.orchestrationRunId, next.fail);
      else if ('lose' in next) loop.orchestrations.records.delete(latest.orchestrationRunId);
      else {
        loop.orchestrations.complete(latest.orchestrationRunId, next.steps);
        const { digest, store } = loop.orchestrations.get(latest.orchestrationRunId)?.steps ?? {};
        const digestRunId = digest?.runIds[digest.runIds.length - 1];
        if (digestRunId !== undefined && store?.status === 'complete') {
          client.points.set(digestRunId, store.counts['chunks'] ?? 0);
        }
      }
    },
  });
  return {
    loop,
    client,
    sink,
    posted: loop.orchestrations.startRequests,
    script: (...next) => {
      queue.push(...next);
    },
  };
}
