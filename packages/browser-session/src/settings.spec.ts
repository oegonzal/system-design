import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EngineConfigError } from '@sysdesign/config-kit';
import { FIELD_TYPES, memoryStrategySchema } from '@sysdesign/contracts';

import { PACKAGE_ROOT, SessionConfigError } from './config';
import { readSessionSettings, UNJUDGED_RUN, type MemoryBrainSettings } from './settings';

/** The strategy the job assistant's space is judged from: the one the RUNBOOK names, kept beside its brief. */
const PROVIDED_STRATEGY = join(
  PACKAGE_ROOT,
  '..',
  '..',
  'docs',
  'agentic-system',
  'strategies',
  'job-assistant',
  'strategy.json',
);

const CONFIG = join(PACKAGE_ROOT, 'config');
const real = (at: string): string => readFileSync(at, 'utf8');
/** The shipped file of a kind, as JSON, for a spec to vary one field of. */
const shippedJson = <T>(kind: string, name: string): T =>
  JSON.parse(real(join(CONFIG, kind, `${name}.json`))) as T;

/** The package's own files, with the choices file replaced — and any file named here replaced too. */
const choosing =
  (choices: Record<string, string>, files: Record<string, string> = {}) =>
  (at: string): string => {
    if (at === join(CONFIG, 'engine.json')) return JSON.stringify(choices);
    const named = Object.entries(files).find(([name]) => at === join(CONFIG, name));
    return named === undefined ? real(at) : named[1];
  };

const profiles = (kind: string): string[] =>
  readdirSync(join(CONFIG, kind))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length));

/** The choices the package ships, for a spec that varies one of them. */
/** The judged run of the provided strategy (docs/agentic-system/strategies/job-assistant), the one the shipped file binds to. */
const JUDGED_RUN = '2026-10-27T23-52-55-161-d2f2e4-quality';
const SHIPPED = JSON.parse(real(join(CONFIG, 'engine.json'))) as Record<string, string>;

describe('the session settings', () => {
  it('[BRW-7] reads the choices the package ships, and every profile it ships validates', () => {
    const shipped = readSessionSettings(PACKAGE_ROOT);
    expect(shipped.capture).toEqual({ after: ['fill', 'select', 'upload'], failures: true });
    expect(shipped.session.headed).toBe(true);
    expect(shipped.sources.capture).toMatch(/config\/capture\/field-entries\.json$/);
    expect(shipped.sources.session).toMatch(/config\/session\/standard\.json$/);
    // How the browser waits on and reads a page: the figures each measured live, declared rather than coded.
    expect(shipped.sources.observe).toMatch(/config\/observe\/standard\.json$/);
    expect(shipped.observe).toEqual({
      actionTimeoutMs: 15000,
      pageOpenWaitMs: 1500,
      settleTimeoutMs: 10000,
      settleRetryMs: 400,
      emptySnapshotReads: 4,
      factsTimeoutMs: 1000,
      observeBudgetMs: 20000,
      wholesaleReads: 3,
      stableReads: 4,
      scrollPx: 600,
    });
    // The operator is asked at the terminal and through the notifications service.
    expect(shipped.sources.operator).toMatch(/config\/operator\/terminal-and-notifications\.json$/);
    expect(Object.keys(shipped.operator.channels)).toEqual(['notifications']);
    // [BRW-20] The terminal, where an automated operator may type, is the one channel whose answers are kept
    // for the session alone; every channel the notifications service runs is the service's to name, and taught.
    expect(shipped.operator.untaught).toEqual(['terminal']);
    // [BRW-16] What the session types without asking is a total table over the kinds a value may rest on.
    expect(shipped.sources.answering).toMatch(/config\/answering\/standard\.json$/);
    expect(shipped.answering.fills).toEqual({
      stated: 'fill',
      restated: 'fill',
      derived: 'fill',
      mapped: 'fill',
      inferred: 'fill',
      composed: 'fill',
      policy: 'fill',
      // A value about the unit alone rests on the page's own words, which the grounding critic reads beside it,
      // and the operator asked (2026-10-14) that such questions be answered without asking.
      unit: 'fill',
      none: 'ask',
    });
    // [BRW-18] Every basis a suggestion rests on is typed in the operator's place: the operator asked
    // (2026-10-15) that an open question be answered rather than waited on; a typed draft is taught to nobody.
    expect(shipped.answering.drafts).toEqual({
      record: 'fill',
      transfer: 'fill',
      invented: 'fill',
    });
    // One window per service the session rides out, all three declared on the session, and its beat.
    expect(Object.keys(shipped.session)).toEqual([
      'headed',
      'rails',
      'loopRecovery',
      'advisorRecovery',
      'busRecovery',
      'liveness',
    ]);
    expect(shipped.session.busRecovery).toEqual({ windowMs: 60000, pauseMs: 2000 });
    // The beat and the stale window the session constants held before they were declared.
    expect(shipped.session.liveness).toEqual({ heartbeatEveryMs: 15000, staleAfterMs: 60000 });
    // The brain the package ships decides through the loop alone; the memory-backed one is a one-word edit away.
    expect(shipped.sources.brain).toMatch(/config\/brain\/loop\.json$/);
    expect(shipped.brain).toEqual({ adapter: 'loop' });

    // Every file a choice could name is a complete, valid configuration of its kind.
    expect(profiles('capture').sort()).toEqual(['every-action', 'field-entries', 'observations']);
    expect(profiles('operator').sort()).toEqual(['terminal', 'terminal-and-notifications']);
    expect(profiles('answering')).toEqual(['standard']);
    expect(profiles('observe')).toEqual(['standard']);
    expect(profiles('brain').sort()).toEqual(['loop', 'memory']);
    for (const capture of profiles('capture')) {
      for (const session of profiles('session')) {
        for (const operator of profiles('operator')) {
          for (const answering of profiles('answering')) {
            for (const observe of profiles('observe')) {
              for (const brain of profiles('brain')) {
                expect(() =>
                  readSessionSettings(
                    PACKAGE_ROOT,
                    choosing({ capture, session, operator, answering, observe, brain }),
                  ),
                ).not.toThrow();
              }
            }
          }
        }
      }
    }
  });

  it('[BRW-7] reads the memory-backed brain as declared data: a binding, the roles recalled and taught, a legend over them and a total recall table', () => {
    const { brain } = readSessionSettings(PACKAGE_ROOT, choosing({ ...SHIPPED, brain: 'memory' }));
    if (brain.adapter !== 'memory') throw new Error('the memory profile names the memory adapter');
    // The space by name and design run, the keys every request names, and one register per role.
    expect(brain.binding.space.name).toBe('job-assistant');
    expect(brain.binding.scope).toEqual({ partition: 'tenant', unit: 'unit' });
    // A role is this program's own word for a kind of memory (a hyphenated word, the client's grammar);
    // the register it names keeps the strategy's spelling, and only the bound space translates the two.
    expect(Object.keys(brain.binding.registers).sort()).toEqual([
      'claim-boundary',
      'profile-fact',
      'profile-story',
      'standing-answer',
    ]);
    expect(Object.values(brain.binding.registers).map((need) => need.name)).toEqual([
      'profile_fact',
      'profile_story',
      'claim_boundary',
      'standing_answer',
    ]);
    for (const need of Object.values(brain.binding.registers)) expect(need.kind).toBe('semantic');
    // What is taught is recalled: the teach role is among the facts, and declares the verbs each use needs.
    expect(brain.facts).toEqual([
      'profile-fact',
      'profile-story',
      'claim-boundary',
      'standing-answer',
    ]);
    expect(brain.teach).toBe('standing-answer');
    // Only the verbs the brain sends: it recalls and remembers; closing a record is the owner's path, outside the binding.
    expect(brain.binding.registers[brain.teach]?.operations).toEqual(['recall', 'remember']);
    expect(brain.binding.registers[brain.teach]?.metadata).toEqual(['question', 'channel']);
    // The legend explains exactly the facts roles' registers, in their order.
    expect(brain.legend.map((entry) => entry.kind)).toEqual(
      brain.facts.map((role) => brain.binding.registers[role]?.name),
    );
    // A total table over the field types: free text draws deepest; the cap and the fan-out are declared.
    expect(Object.keys(brain.recall.hitsPerFieldType).sort()).toEqual([...FIELD_TYPES].sort());
    expect(brain.recall.hitsPerFieldType.textarea).toBe(10);
    for (const type of FIELD_TYPES.filter((type) => type !== 'textarea')) {
      expect(brain.recall.hitsPerFieldType[type]).toBe(3);
    }
    expect(brain.recall.maxEvidence).toBe(24);
    expect(brain.recall.concurrency).toBe(4);
    expect(brain.project).toBe('job-assistant');
    expect(brain.binding.recovery).toEqual({ windowMs: 60000, pauseMs: 2000 });
  });

  it('[BRW-24] binds the shipped file to the provided strategy — every register by name, kind, operations and metadata — and to the judged run of the provided strategy', () => {
    const { brain } = readSessionSettings(PACKAGE_ROOT, choosing({ ...SHIPPED, brain: 'memory' }));
    if (brain.adapter !== 'memory') throw new Error('the memory profile names the memory adapter');
    const strategy = memoryStrategySchema.parse(JSON.parse(real(PROVIDED_STRATEGY)));
    for (const [role, need] of Object.entries(brain.binding.registers)) {
      const register = strategy.registers.find(({ name }) => name === need.name);
      expect(
        register,
        `role ${role}: the strategy declares no register ${need.name}`,
      ).toBeDefined();
      expect(register?.kind).toBe(need.kind);
      expect(register?.metadata).toEqual(expect.arrayContaining(need.metadata));
      const declared = strategy.interfaces
        .filter((entry) => entry.register === need.name)
        .map((entry) => entry.operation);
      expect(declared).toEqual(expect.arrayContaining(need.operations));
    }
    // The run is the placeholder until the strategy is judged: a brain told to bind refuses by name,
    // and a reader of the file sees that nobody has judged it yet rather than a run that looks real.
    expect(brain.binding.space.runId).toBe(JUDGED_RUN);
    expect(brain.binding.space.runId).not.toBe(UNJUDGED_RUN);
  });

  it('[BRW-7] refuses a memory-backed brain by name: a teach role not recalled, a legend for no role, a field type left unclassified, an adapter nobody built', () => {
    const memory = shippedJson<MemoryBrainSettings>('brain', 'memory');
    const varied = (change: (settings: MemoryBrainSettings) => unknown) => () =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { ...SHIPPED, brain: 'memory' },
          { 'brain/memory.json': JSON.stringify(change(memory)) },
        ),
      );
    /** The shipped file with one role's register needing other operations. */
    const withOperations = (settings: MemoryBrainSettings, role: string, operations: string[]) => ({
      ...settings,
      binding: {
        ...settings.binding,
        registers: {
          ...settings.binding.registers,
          [role]: { ...settings.binding.registers[role], operations },
        },
      },
    });
    expect(
      varied((settings) => ({ ...settings, teach: 'profile-fact', facts: ['profile-story'] })),
    ).toThrow(
      /brain\/memory\.json is not a brain configuration — .*teach: is not among facts: what is taught must be recalled/,
    );
    expect(varied((settings) => ({ ...settings, facts: [...settings.facts, 'anecdote'] }))).toThrow(
      /facts\.4: is no role of the binding: anecdote/,
    );
    expect(
      varied((settings) => ({ ...settings, facts: [...settings.facts, 'profile-fact'] })),
    ).toThrow(/facts: names a role twice/);
    // A role spelled outside the client's grammar is the client's refusal, by field.
    expect(
      varied((settings) => ({
        ...settings,
        binding: {
          ...settings.binding,
          registers: {
            ...settings.binding.registers,
            profile_fact: settings.binding.registers['profile-fact'],
          },
        },
      })),
    ).toThrow(/binding\.registers\.profile_fact: /);
    // A facts role whose register declares no recall, and a teach role whose register declares no remember.
    expect(varied((settings) => withOperations(settings, 'profile-fact', ['remember']))).toThrow(
      /facts\.0: role profile-fact declares no recall/,
    );
    expect(varied((settings) => withOperations(settings, 'standing-answer', ['recall']))).toThrow(
      /teach: role standing-answer declares no remember/,
    );
    // The legend explains each facts role's register once, and no other.
    expect(
      varied((settings) => ({
        ...settings,
        legend: [...settings.legend, { kind: 'anecdote', use: 'a story the subject tells' }],
      })),
    ).toThrow(/legend: explains anecdote for no facts role/);
    expect(varied((settings) => ({ ...settings, legend: settings.legend.slice(1) }))).toThrow(
      /legend: explains no profile_fact/,
    );
    expect(
      varied((settings) => ({ ...settings, legend: [...settings.legend, settings.legend[0]] })),
    ).toThrow(/legend: explains a register twice/);
    expect(
      varied((settings) => ({
        ...settings,
        legend: settings.legend.map((entry, index) =>
          index === 0 ? { ...entry, use: 'one line\nand another' } : entry,
        ),
      })),
    ).toThrow(/legend\.0\.use: is not one line/);
    // The recall table is total over the field types: one left out, or one the vocabulary lacks, refuses the file.
    expect(
      varied((settings) => {
        const { textarea: _dropped, ...rest } = settings.recall.hitsPerFieldType;
        return { ...settings, recall: { ...settings.recall, hitsPerFieldType: rest } };
      }),
    ).toThrow(/recall\.hitsPerFieldType\.textarea: /);
    expect(
      varied((settings) => ({
        ...settings,
        recall: {
          ...settings.recall,
          hitsPerFieldType: { ...settings.recall.hitsPerFieldType, signature: 3 },
        },
      })),
    ).toThrow(/recall\.hitsPerFieldType: Unrecognized key: "signature"/);
    expect(
      varied((settings) => ({ ...settings, recall: { ...settings.recall, concurrency: 0 } })),
    ).toThrow(/recall\.concurrency: /);
    // A binding the client cannot read is the client's refusal, by field.
    expect(
      varied((settings) => ({
        ...settings,
        binding: { ...settings.binding, scope: { partition: 'tenant' } },
      })),
    ).toThrow(/binding\.scope\.unit: /);
    // An adapter nobody built, and a memory field on the loop's own file, are fields no schema declares.
    expect(varied((settings) => ({ ...settings, adapter: 'oracle' }))).toThrow(EngineConfigError);
    expect(varied((settings) => ({ ...settings, adapter: 'oracle' }))).toThrow(/adapter: /);
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(SHIPPED, { 'brain/loop.json': '{"adapter":"loop","project":"x"}' }),
      ),
    ).toThrow(EngineConfigError);
  });

  it('[BRW-7] refuses by name a kind left unchosen, a field no schema declares, and a target above its budget', () => {
    expect(() => readSessionSettings(PACKAGE_ROOT, choosing({ capture: 'field-entries' }))).toThrow(
      SessionConfigError,
    );
    expect(() => readSessionSettings(PACKAGE_ROOT, choosing({ capture: 'field-entries' }))).toThrow(
      /config\/engine\.json chooses no session: name a file under .*config\/session/,
    );
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          { 'capture/field-entries.json': '{"after":["fill"],"failures":true,"fullPage":true}' },
        ),
      ),
    ).toThrow(EngineConfigError);
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          { 'capture/field-entries.json': '{"after":["fill","fill"],"failures":true}' },
        ),
      ),
    ).toThrow(/after: lists a kind twice/);
    const standard = JSON.parse(real(join(CONFIG, 'session', 'standard.json'))) as {
      rails: Record<string, unknown>;
    };
    const overTarget = { ...standard, rails: { ...standard.rails, targetDone: 50, maxTasks: 5 } };
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          { 'session/standard.json': JSON.stringify(overTarget) },
        ),
      ),
    ).toThrow(/rails\.targetDone: is above maxTasks/);
    // A channel the session cannot build is refused by name.
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          {
            'operator/terminal.json':
              '{"expiresAfterMs":1000,"asksAfterRefusal":1,"channels":{"carrier-pigeon":{}},"untaught":[]}',
          },
        ),
      ),
    ).toThrow(EngineConfigError);
    // [BRW-20] A channel named twice among those kept untaught is refused by name.
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          {
            'operator/terminal.json':
              '{"expiresAfterMs":1000,"asksAfterRefusal":1,"channels":{},"untaught":["terminal","terminal"]}',
          },
        ),
      ),
    ).toThrow(/untaught: names a channel twice/);
    // A channel's own recovery window is a field no schema declares: the session's one bus window serves it.
    expect(() =>
      readSessionSettings(
        PACKAGE_ROOT,
        choosing(
          { capture: 'field-entries', session: 'standard', operator: 'terminal' },
          {
            'operator/terminal.json':
              '{"expiresAfterMs":1000,"asksAfterRefusal":1,"channels":{"notifications":{"pullWaitMs":1000,"eventsPerPull":5,"recovery":{"windowMs":1,"pauseMs":1}}},"untaught":[]}',
          },
        ),
      ),
    ).toThrow(EngineConfigError);
  });
});
