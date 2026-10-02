import type {
  LlmExchangeSummaryDto,
  PromptLibraryDocumentDto,
  RunHeartbeatDto,
} from '@sysdesign/contracts';

import type { FakeIteration } from './trace-builders';

/** What a scripted run does when it settles, keyed by the run's goal. */
export type RunScenario =
  | { outcome: 'complete'; iterations?: FakeIteration[]; once?: boolean }
  | { outcome: 'fail'; message: string; once?: boolean }
  | { outcome: 'refuse'; status?: number; message?: string; once?: boolean };

export interface FakeLoopOptions {
  model?: string;
  /** `fake-run` → `fake-run-1`, `fake-run-2`, …; the stub uses a per-process prefix. */
  runIdPrefix?: string;
  pipelineVersion?: string;
  library?: readonly PromptLibraryDocumentDto[];
  /** When set, any other pipeline is refused with 404, as the real loop does. */
  knownPipelines?: readonly string[];
  /** Exchange scopes a run starts with, so a live signal exists before it settles. */
  startExchanges?: readonly string[];
  now?: () => string;
  /** The pace `health` reports; the loop's own defaults unless a spec says otherwise. */
  heartbeat?: RunHeartbeatDto;
}

/** The loop's default pace: a beat a minute, a run given up after three silent minutes. */
export const FAKE_LOOP_HEARTBEAT: RunHeartbeatDto = {
  heartbeatEveryMs: 60_000,
  staleAfterMs: 180_000,
};

export const exchangesOf = (scopes: readonly string[], at: string): LlmExchangeSummaryDto[] =>
  scopes.map((scope, index) => ({
    scope,
    ordinal: index + 1,
    outcome: 'ok' as const,
    durationMs: 10,
    startedAt: at,
  }));
