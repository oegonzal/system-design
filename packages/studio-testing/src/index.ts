/**
 * @sysdesign/studio-testing — the quality loop as a scriptable fake, shared
 * by the studio API's in-process client fake and the e2e suite's HTTP stub.
 * One state machine, two transports: a spec and a browser run grade the same
 * markdown the same way. Imported only by specs, the studio's test folder and
 * the stub; no runtime file may import it.
 */
export { FakeLoop } from './fake-loop';
export { FakeLoopClient } from './fake-loop-client';
export type { FakeLoopOptions, RunScenario } from './fake-loop-options';
export { FakeOrchestrations, type FakeOrchestrationDeps } from './fake-orchestrations';
export { FAKE_RECALLED_LESSONS, fakeRecalled, fakeRecallRunId } from './fake-recall';
export { DerivationFailed, LoopRefused, LoopUnreachable } from './loop-errors';
export type { FakeIteration } from './trace-builders';
