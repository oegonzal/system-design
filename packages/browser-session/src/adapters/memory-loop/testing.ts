import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  BoundSpace,
  MemoryClient,
  RecallRequest,
  RememberRequest,
} from '@sysdesign/agentic-memory-client';
import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';
import { CONFIG_DIR, ENGINE_FILE } from '@sysdesign/config-kit';
import {
  memoryStrategySchema,
  MISSION_FIXTURE,
  type FieldAnswers,
  type FieldSpec,
  type MemoryScope,
  type MemoryStrategy,
  type OperationVerb,
  type OperatorGuidanceDto,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { PACKAGE_ROOT } from '../../config';
import type { FieldsInput } from '../../core/ports';
import { fieldAnswer } from '../../core/testing';
import { readSessionSettings, type MemoryBrainSettings } from '../../settings';
import { bindBrainSpace } from './binding';
import { MemoryLoopBrain } from './memory-loop-brain';

/**
 * What the memory-loop adapter's specs build on: a strategy with the four
 * registers the shipped binding names, the brain settings the shipped file
 * declares read through the one reader that ships, a brain over the runtime
 * in process and the fake loop, and the answers and fields a page is made of.
 * Nothing here is scripted: every space is the engine's. No vitest import, so
 * any spec project can use it.
 */

export const ASSISTANT_RUN = 'run-assistant';
export const SPACE_NAME = 'assistant';
export const TENANT = 't-1';
export const PROJECT = 'assistant';
export const SUBJECT = 'Alex Example';

/** The session and step every decision in these specs is asked in. */
export const SESSION = { sessionId: '11111111-1111-4111-8111-111111111111', step: 6 };
/** When every answer was given, unless a spec says otherwise. */
export const AT = '2026-10-10T12:00:00.000Z';

/** The registers of facts about the subject, and the one of the subject's own answers. */
export const FACT_REGISTERS = ['profile_fact', 'profile_story', 'claim_boundary'] as const;
export const ANSWERS_REGISTER = 'standing_answer';

/** A unit of work's key as the brain writes it into a scope: hashed — the rule the specs hold the brain to. */
export const unitValue = (unitKey: string): string =>
  createHash('sha256').update(unitKey).digest('hex');

type Register = MemoryStrategy['registers'][number];
type Interface = MemoryStrategy['interfaces'][number];
type Step = MemoryStrategy['workflows'][number]['steps'][number];

const register = (name: string, metadata: string[] = []): Register => ({
  name,
  kind: 'semantic',
  term: 'long_term',
  holds: 'one fact about the subject',
  store: 'rows',
  scope: 'tenant, then project, then unit',
  metadata,
  lifecycle: 'superseded in place',
});

const iface = (operation: OperationVerb, name: string): Interface => ({
  operation,
  register: name,
  input: 'a request',
  output: 'an answer',
  guarantee: 'scoped',
});

const step = (operation: OperationVerb, name: string): Step => ({
  operation,
  register: name,
  does: 'a step',
});

/**
 * The strategy the space under test is made from: three registers of facts a
 * spec writes and the brain recalls, and one of the subject's own answers the
 * brain writes, supersedes and invalidates. A spec names other metadata on
 * the answers, or other interfaces, to make a space the binding does not fit.
 */
export function assistantStrategy(
  options: { answerMetadata?: string[]; interfaces?: Interface[] } = {},
): MemoryStrategy {
  const facts = [...FACT_REGISTERS];
  return memoryStrategySchema.parse({
    summary:
      'The memory of a form-filling assistant: what is true of the subject, and what the subject answered.',
    assumptions: [],
    registers: [
      ...facts.map((name) => register(name)),
      register(ANSWERS_REGISTER, options.answerMetadata ?? ['question', 'channel']),
    ],
    interfaces: options.interfaces ?? [
      ...facts.flatMap((name) => [iface('remember', name), iface('recall', name)]),
      iface('remember', ANSWERS_REGISTER),
      iface('recall', ANSWERS_REGISTER),
      iface('update', ANSWERS_REGISTER),
      iface('invalidate', ANSWERS_REGISTER),
    ],
    workflows: [
      {
        name: 'answer a field',
        kind: 'recall_routing',
        steps: [...facts, ANSWERS_REGISTER].map((name) => step('recall', name)),
      },
      {
        name: 'teach an answer',
        kind: 'write_pipeline',
        steps: [step('remember', ANSWERS_REGISTER)],
      },
    ],
    safeguards: [],
    tradeoffs: [],
    risks: [],
  });
}

const CONFIG = join(PACKAGE_ROOT, CONFIG_DIR);
const ENGINE = join(CONFIG, ENGINE_FILE);
const MEMORY_BRAIN = join(CONFIG, 'brain', 'memory.json');

/**
 * The brain settings the shipped memory file declares — its roles, registers,
 * legend and recall table as the owner reads them — read through the one
 * reader that ships, over the space under test: the space by the spec's name
 * and run, under the spec's project, with a recovery that does not wait. So
 * a role and the register it names are told apart here exactly as they are
 * live.
 */
function shippedBrainSettings(): MemoryBrainSettings {
  const shipped = JSON.parse(readFileSync(MEMORY_BRAIN, 'utf8')) as {
    binding: Record<string, unknown>;
  };
  const underTest = {
    ...shipped,
    project: PROJECT,
    binding: {
      ...shipped.binding,
      space: { name: SPACE_NAME, runId: ASSISTANT_RUN },
      recovery: { windowMs: 0, pauseMs: 1 },
    },
  };
  const choices = JSON.parse(readFileSync(ENGINE, 'utf8')) as Record<string, string>;
  const { brain } = readSessionSettings(PACKAGE_ROOT, (at) => {
    if (at === ENGINE) return JSON.stringify({ ...choices, brain: 'memory' });
    if (at === MEMORY_BRAIN) return JSON.stringify(underTest);
    return readFileSync(at, 'utf8');
  });
  if (brain.adapter !== 'memory')
    throw new Error('the shipped memory file names the memory adapter');
  return brain;
}

export const BRAIN_SETTINGS: MemoryBrainSettings = shippedBrainSettings();

/** What a spec sees of the host the brain talks to, and how it makes the host fail. */
export interface MemoryHostSpy {
  /** Every recall request sent, in order, as the brain wrote it. */
  recalls: RecallRequest[];
  /** Every write sent, in order. */
  writes: RememberRequest[];
  /** Space reads: what a probe costs. */
  reads: number;
  /** While set, every call fails with it — a host down, or one refusing. */
  failing: Error | null;
  /** The next call alone fails with it — a write that lost its race. */
  failNext: Error | null;
}

/** The client with every call recorded, and failing as the spy says; the calls that reach it are the runtime's. */
export function spiedClient(inner: MemoryClient): { client: MemoryClient; spy: MemoryHostSpy } {
  const spy: MemoryHostSpy = { recalls: [], writes: [], reads: 0, failing: null, failNext: null };
  const client = new Proxy(inner, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        if (property === 'recall') spy.recalls.push(args[1] as RecallRequest);
        if (property === 'remember') spy.writes.push(args[1] as RememberRequest);
        if (property === 'getSpace') spy.reads += 1;
        if (spy.failing !== null) return Promise.reject(spy.failing);
        if (spy.failNext !== null) {
          const error = spy.failNext;
          spy.failNext = null;
          return Promise.reject(error);
        }
        return (value as (...given: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { client, spy };
}

export interface BrainHarness {
  brain: MemoryLoopBrain;
  /** The client the brain talks to, spied; a spec seeds and reads the space through it too. */
  client: MemoryClient;
  spy: MemoryHostSpy;
  loop: FakeLoop;
  bound: BoundSpace;
  /** Every row the runtime holds, for a spec to read what a write left. */
  rows: () => ReturnType<ReturnType<typeof memoryClientUnderTest>['records']['all']>;
  /** What the brain said for a person to hear. */
  warnings: string[];
}

/** What the runtime under test is made with, beyond its strategies: the spec's policy and embedder, when it names them. */
type RuntimeOptions = Pick<
  NonNullable<Parameters<typeof memoryClientUnderTest>[0]>,
  'policy' | 'embedder'
>;

/**
 * A brain over a fresh space made from the strategy given — the shipped
 * binding's unless a spec names another — bound as a run binds it, and a fake
 * loop whose every poll settles what is running by the script given.
 */
export async function brainUnderTest(
  settle: (loop: FakeLoop) => void,
  options: { strategy?: MemoryStrategy; settings?: MemoryBrainSettings } & RuntimeOptions = {},
): Promise<BrainHarness> {
  const settings = options.settings ?? BRAIN_SETTINGS;
  const { client: inner, records } = memoryClientUnderTest({
    strategies: { [ASSISTANT_RUN]: options.strategy ?? assistantStrategy() },
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    ...(options.embedder === undefined ? {} : { embedder: options.embedder }),
  });
  const { client, spy } = spiedClient(inner);
  const bound = await bindBrainSpace(client, settings);
  // The fake's clock is the real one, so a run opened a moment ago has a fresh heartbeat.
  const loop = new FakeLoop({ now: () => new Date().toISOString() });
  const warnings: string[] = [];
  const brain = new MemoryLoopBrain(new FakeLoopClient(loop), client, settings, TENANT, {
    pollEveryMs: 0,
    sleep: async () => settle(loop),
    warn: (text) => warnings.push(text),
  });
  await brain.bind();
  return { brain, client, spy, loop, bound, rows: () => records.all(), warnings };
}

/** The answers the fake loop settles every form run with. */
export const ANSWERS: FieldAnswers = {
  summary: 'one field',
  fields: [fieldAnswer('e1', { value: '6', reason: 'cv' })],
};

/** Every running run completed with the artifact, accepted. */
export const completeRuns = (artifact: unknown) => (loop: FakeLoop) => {
  for (const run of loop.runs.values()) {
    if (run.status === 'running') {
      loop.complete(run.runId, [{ overall: 90, decision: 'accept', artifact }]);
    }
  }
};

/** One answer as the session records it, about the subject and given at the terminal unless a spec says otherwise. */
export function guidance(given: {
  question?: string;
  answer?: string;
  options?: string[] | null;
  about?: MemoryScope | null;
  unitKey?: string | null;
  via?: string;
}): OperatorGuidanceDto {
  return {
    sessionId: SESSION.sessionId,
    capturedAt: AT,
    field: {
      question: given.question ?? 'Are you authorized to work in this country',
      type: 'radio',
      options: given.options === undefined ? ['Yes', 'No'] : given.options,
    },
    context: {
      taskLabel: 'Engineer at Acme',
      unitKey: given.unitKey ?? null,
      page: 'Engineer | Acme',
    },
    answer: given.answer ?? 'Yes',
    about: given.about === undefined ? 'subject' : given.about,
    chosen: null,
    via: given.via ?? 'terminal',
  };
}

/** One form field: a required textbox asking what its name says, unless a spec says otherwise. */
export const field = (
  ref: string,
  name: string,
  overrides: Partial<FieldSpec> = {},
): FieldSpec => ({
  ref,
  role: 'textbox',
  name,
  inputType: null,
  options: null,
  optionsOmitted: 0,
  value: null,
  required: true,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context: null,
  ...overrides,
});

export const CRITERIA = [
  { id: 'c1', kind: 'grounding', statement: 'Every value rests on the evidence.' },
];

/** A page's fields put to the brain, in the unit of work keyed — none for null — at the step given. */
export const fieldsInput = (
  fields: FieldSpec[],
  unitKey: string | null,
  step = SESSION.step,
): FieldsInput => ({
  session: { sessionId: SESSION.sessionId, step },
  mission: MISSION_FIXTURE,
  task:
    unitKey === null
      ? null
      : { label: 'Acme', url: 'https://x.test/1', facets: [], unitKey, context: null },
  fields,
  criteria: CRITERIA,
});
