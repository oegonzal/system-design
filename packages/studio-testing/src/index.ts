/**
 * @sysdesign/studio-testing — the quality loop as a scriptable fake, shared
 * by the studio API's in-process client fake and the e2e suite's HTTP stub.
 * One state machine, two transports: a spec and a browser run grade the same
 * markdown the same way. Imported only by specs, the studio's test folder and
 * the stub; no runtime file may import it.
 */
export { FakeLoop, type FakeLoopOptions, type RunScenario } from './fake-loop';
export { DerivationFailed, LoopRefused, LoopUnreachable } from './loop-errors';
export type { FakeIteration } from './trace-builders';
