// The fakes a program's specs run tool sessions with, kept out of the runtime barrel.
export { bootToolSessionApp, type BootedToolSessionApp } from './nest/testing';
export {
  FakeEvents,
  FakeLoopClient,
  FakeOperator,
  fakeDeps,
  fakeTool,
  okTool,
  quietLog,
  sampleSettings,
  type ScriptedAnswer,
  type ScriptedRun,
} from './session/testing';
