import type {
  OrchestrationRunDto,
  OrchestrationStepDto,
  StartOrchestrationRequest,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { LoopIngestSink } from '../adapters/loop-http/loop-ingest-sink';
import { FIXED_NOW, STORED_STEPS } from './fakes';

/**
 * The loop as the shared fake, behind the shipping sink — so a spec exercises
 * the adapter that ships, with the orchestrations settled by script instead of
 * by a model. Test code only: `@sysdesign/studio-testing` is for specs, and
 * this folder is outside the app build (`tsconfig.app.json`).
 */

/** How the fake settles the orchestration a post is waiting on. */
export type SettleScript =
  | { steps: Record<string, Partial<OrchestrationStepDto>> }
  | { fail: string }
  /** The loop forgets the orchestration mid-wait, so the wait is lost. */
  | { lose: true };

/** The default: digest and store complete, the facts stored. */
export const DEFAULT_SETTLE: SettleScript = { steps: STORED_STEPS };

/** The shared fake client, plus a refusal a spec can arm for the next start, and a count of what was running when each start arrived. */
export class ScriptedLoopClient extends FakeLoopClient {
  refuseNextStart: Error | null = null;
  /** Orchestrations still running at each start — all zeros when posting is truly one at a time. */
  readonly runningAtStart: number[] = [];

  override startOrchestration(orchestrator: string, request: StartOrchestrationRequest) {
    if (this.refuseNextStart !== null) {
      const error = this.refuseNextStart;
      this.refuseNextStart = null;
      return Promise.reject(error);
    }
    this.runningAtStart.push(runningOrchestrations(this.core).length);
    return super.startOrchestration(orchestrator, request);
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
}

/**
 * The sink's wait sleeps between polls; here a sleep settles the newest
 * running orchestration by the next script entry (the default completes
 * digest and store), so a post resolves on its second read without a timer.
 */
export function fakeIngestLoop(script: readonly SettleScript[] = []): FakeIngestLoop {
  const loop = new FakeLoop();
  const client = new ScriptedLoopClient(loop);
  const queue = [...script];
  const sink = new LoopIngestSink(client, {
    pollEveryMs: 0,
    staleAfterMs: 180_000,
    now: () => Date.parse(FIXED_NOW),
    sleep: async () => {
      const running = runningOrchestrations(loop);
      const latest = running[running.length - 1];
      if (latest === undefined) return;
      const next = queue.shift() ?? DEFAULT_SETTLE;
      if ('fail' in next) loop.orchestrations.fail(latest.orchestrationRunId, next.fail);
      else if ('lose' in next) loop.orchestrations.records.delete(latest.orchestrationRunId);
      else loop.orchestrations.complete(latest.orchestrationRunId, next.steps);
    },
  });
  return { loop, client, sink, posted: loop.orchestrations.startRequests };
}
