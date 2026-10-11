import { MISSION_FIXTURE, type SessionRailsDto } from '@sysdesign/contracts';

import type { CapturePolicy } from './engine-context';
import { runSession, type SessionOutcome } from './session-engine';
import {
  FakeBrowser,
  FixedClock,
  InMemoryDumpStore,
  InMemoryGoalSource,
  InMemoryLedger,
  ScriptedBrain,
  ScriptedOperator,
  type BrainScript,
} from './testing';
import { journeyPages } from './testing-journey';

/**
 * One scripted session for the engine's specs: the fakes composed around
 * `runSession` over the shared journey, every rail wide unless a scenario
 * narrows one, and what each fake recorded handed back beside the outcome
 * and the session row. No vitest import, so any spec project can use it.
 */
export const SPEC_RAILS: SessionRailsDto = {
  targetDone: null,
  maxTasks: 10,
  maxMinutes: 60,
  maxConsecutiveFailures: 3,
  maxBrainFaults: 3,
  maxUnreadablePages: 3,
  maxStalledSteps: 3,
};

export const SPEC_SUBJECT = 'Alex Example';

/** No images beyond each step's own screenshot: the step specs pin each step's files exactly. */
export const NO_CAPTURE: CapturePolicy = { after: [], failures: false };

/** How long a spec's questions are offered: long past any spec. */
export const SPEC_QUESTION_EXPIRY_MS = 3_600_000;

export interface Scenario {
  script: BrainScript;
  /** What the operator types, line by line. */
  lines?: string[];
  rails?: Partial<SessionRailsDto>;
  clock?: FixedClock;
  browser?: FakeBrowser;
  /** The operator, when a spec watches its questions as they are asked; else one typing `lines`. */
  operator?: ScriptedOperator;
  ledger?: InMemoryLedger;
  startUrl?: string;
  capture?: CapturePolicy;
}

export async function runScripted(scenario: Scenario) {
  const browser = scenario.browser ?? new FakeBrowser(journeyPages());
  const brain = new ScriptedBrain(scenario.script);
  const ledger = scenario.ledger ?? new InMemoryLedger();
  const operator = scenario.operator ?? new ScriptedOperator(scenario.lines ?? []);
  const dumps = new InMemoryDumpStore();
  const warnings: string[] = [];
  const outcome: SessionOutcome = await runSession(
    {
      browser,
      brain,
      ledger,
      operator,
      goals: new InMemoryGoalSource({ 'goals/test.md': MISSION_FIXTURE }),
      clock: scenario.clock ?? new FixedClock(),
      dumps,
      warn: (text) => warnings.push(text),
      log: () => undefined,
    },
    {
      goalPath: 'goals/test.md',
      profile: 'spec',
      headed: false,
      rails: { ...SPEC_RAILS, ...scenario.rails },
      subject: SPEC_SUBJECT,
      startUrl: scenario.startUrl,
      capture: scenario.capture ?? NO_CAPTURE,
      questionExpiresAfterMs: SPEC_QUESTION_EXPIRY_MS,
      settingsSources: {},
    },
  );
  const detail = await ledger.getSession(outcome.sessionId);
  if (detail === null) throw new Error('the session row is gone');
  return { outcome, browser, brain, ledger, operator, dumps, warnings, detail };
}
