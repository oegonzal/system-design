/**
 * @sysdesign/loop-client — the quality loop as one port, its HTTP adapter,
 * the errors both raise, and how a caller waits on a run honestly. Shared by
 * every program that asks the loop to judge; a consumer that serves HTTP maps
 * the errors onto its own gateway statuses in one place.
 */
export { LoopClient } from './loop-client';
export {
  DerivationFailed,
  LoopRefused,
  LoopRunLost,
  LoopRunStale,
  LoopTimeout,
  LoopUnreachable,
} from './loop-errors';
export {
  DERIVE_TIMEOUT_MS,
  HttpLoopClient,
  READ_TIMEOUT_MS,
  type LoopRecovery,
} from './http-loop-client';
export {
  awaitOrchestration,
  awaitRun,
  bestArtifact,
  bestIterationOf,
  DEFAULT_POLL_EVERY_MS,
  type AwaitOptions,
} from './await-run';
