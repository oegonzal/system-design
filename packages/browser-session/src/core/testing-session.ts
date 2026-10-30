import { randomUUID } from 'node:crypto';

import {
  answeringFixture,
  MISSION_FIXTURE,
  type AnsweringSettings,
  type SessionRailsDto,
} from '@sysdesign/contracts';

import type { CapturePolicy } from './engine-context';
import type { StopSignal, SuppliedDocument } from './ports';
import { runSession, type SessionOutcome } from './session-engine';
import {
  FakeBrowser,
  InMemoryDumpStore,
  InMemoryGoalSource,
  InMemoryLedger,
  RecordingEvents,
  ScriptedBrain,
  ScriptedOperator,
  type BrainScript,
} from './testing';
import { FixedClock } from './testing-clock';
import { journeyPages } from './testing-journey';
import type { ConfiguredAdvisor } from './unit-advice';

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

/** A refused answer is put back once, as the shipped operator settings declare. */
const SPEC_ASKS_AFTER_REFUSAL = 1;

/** How long a spec's close waits for its events: long past a recording bus, short enough to time out a held one. */
export const SPEC_EVENTS_DRAIN_MS = 50;

/** The operator's interrupt a spec can press. */
export class FakeStopSignal implements StopSignal {
  private readonly handlers = new Set<() => void>();

  onStop(handler: () => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Ctrl-C. */
  press(): void {
    for (const handler of this.handlers) handler();
  }

  get listening(): boolean {
    return this.handlers.size > 0;
  }
}

export interface Scenario {
  script: BrainScript;
  /** The mission the session runs; the shared fixture unless a scenario declares more. */
  mission?: string;
  /** The advisors the environment configures; the mission names which to ask. */
  advisors?: ConfiguredAdvisor[];
  events?: RecordingEvents;
  stop?: FakeStopSignal;
  dumps?: InMemoryDumpStore;
  /** Whether the subject was given for the run; a spec says false to run on the fallback. */
  subjectDeclared?: boolean;
  /** What the operator types, line by line. */
  lines?: string[];
  rails?: Partial<SessionRailsDto>;
  clock?: FixedClock;
  browser?: FakeBrowser;
  /** The operator, when a spec watches its questions as they are asked; else one typing `lines`. */
  operator?: ScriptedOperator;
  ledger?: InMemoryLedger;
  startUrl?: string;
  /** The files supplied for the documents the mission declares; none unless a scenario says. */
  documents?: readonly SuppliedDocument[];
  capture?: CapturePolicy;
  /** How many times a refused answer is put back; the shipped settings' once unless a scenario says. */
  asksAfterRefusal?: number;
  /** The channels whose answers are kept untaught; none unless a scenario says. */
  untaught?: readonly string[];
  /**
   * Which kinds fill without asking. The journeys answer one field as a guess
   * the record only makes likely (`inferred`), so unless a scenario says, that
   * kind asks here — the one lever the settings are, kept visible in the specs.
   */
  answering?: AnsweringSettings;
}

export async function runScripted(scenario: Scenario) {
  const browser = scenario.browser ?? new FakeBrowser(journeyPages());
  const brain = new ScriptedBrain(scenario.script);
  const ledger = scenario.ledger ?? new InMemoryLedger();
  const operator = scenario.operator ?? new ScriptedOperator(scenario.lines ?? []);
  const dumps = scenario.dumps ?? new InMemoryDumpStore();
  const events = scenario.events ?? new RecordingEvents();
  const stop = scenario.stop ?? new FakeStopSignal();
  const warnings: string[] = [];
  const logs: string[] = [];
  const outcome: SessionOutcome = await runSession(
    {
      browser,
      brain,
      ledger,
      operator,
      goals: new InMemoryGoalSource({ 'goals/test.md': scenario.mission ?? MISSION_FIXTURE }),
      clock: scenario.clock ?? new FixedClock(),
      ids: randomUUID,
      dumps,
      advisors: scenario.advisors ?? [],
      events,
      stop,
      warn: (text) => warnings.push(text),
      log: (text) => logs.push(text),
    },
    {
      goalPath: 'goals/test.md',
      profile: 'spec',
      headed: false,
      rails: { ...SPEC_RAILS, ...scenario.rails },
      subject: SPEC_SUBJECT,
      subjectDeclared: scenario.subjectDeclared ?? true,
      eventsDrainMs: SPEC_EVENTS_DRAIN_MS,
      startUrl: scenario.startUrl,
      documents: scenario.documents ?? [],
      capture: scenario.capture ?? NO_CAPTURE,
      questionExpiresAfterMs: SPEC_QUESTION_EXPIRY_MS,
      asksAfterRefusal: scenario.asksAfterRefusal ?? SPEC_ASKS_AFTER_REFUSAL,
      untaught: scenario.untaught ?? [],
      answering: scenario.answering ?? answeringFixture(['inferred']),
      settingsSources: {},
    },
  );
  const detail = await ledger.getSession(outcome.sessionId);
  if (detail === null) throw new Error('the session row is gone');
  return { outcome, browser, brain, ledger, operator, dumps, events, stop, warnings, logs, detail };
}
