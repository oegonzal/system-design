import type { NewSession, StorageState } from './ports';
import {
  decidedAnswers,
  decidedPlan,
  FakeBrowser,
  InMemoryDumpStore,
  InMemoryLedger,
  RecordingSessionFiles,
  ScriptedBrain,
  ScriptedLoopProbe,
} from './testing';
import { FixedClock } from './testing-clock';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages,
} from './testing-journey';
import { runScripted as run, SPEC_RAILS, SPEC_SUBJECT } from './testing-session';
import { SessionRefused } from './unit-advice';

/**
 * The session's files beyond this machine, over the scripted journey: put
 * in place before the browser opens, kept once it has closed, and the lease
 * and the loop wait that come before them.
 */
const JOURNEY = {
  script: {
    plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
      decidedPlan(p),
    ),
    answers: [decidedAnswers(ANSWERS)],
  },
  lines: ['Yes'],
};

/** A sign-in exported elsewhere, as the files hand it to the engine. */
const SEED: StorageState = {
  cookies: [
    {
      name: 'li_at',
      value: 'secret',
      domain: '.jobs.test',
      path: '/',
      expires: 1_800_000_000,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ],
  origins: [{ origin: 'https://jobs.test', localStorage: [{ name: 'k', value: 'v' }] }],
};

/** A session another process opened on the spec profile, beating ten seconds before the spec clock starts. */
const HELD: NewSession = {
  id: 'held',
  dumpRunId: 'dump-held',
  goalPath: 'goals/test.md',
  goalHash: 'h',
  goalMarkdown: '# another mission',
  profile: 'spec',
  subject: SPEC_SUBJECT,
  headed: false,
  limits: SPEC_RAILS,
  startedAt: new Date('2026-10-03T09:59:50.000Z'),
};

describe('the session’s files beyond this machine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('[BRW-32] are put in place before the browser opens — the documents, then the profile — and the profile is kept once the browser has closed', async () => {
    const browser = new FakeBrowser(journeyPages());
    const files = new RecordingSessionFiles({ kind: 'archived' });
    const browserWhen: string[] = [];
    const profile = files.profile.bind(files);
    files.profile = async (name) => {
      browserWhen.push(`profile: browser ${browser.opened === null ? 'not yet open' : 'open'}`);
      return profile(name);
    };
    const save = files.saveProfile.bind(files);
    files.saveProfile = async (name) => {
      browserWhen.push(`save: browser ${browser.closed ? 'closed' : 'open'}`);
      return save(name);
    };
    const { outcome, logs } = await run({ ...JOURNEY, browser, files });
    expect(outcome.status).toBe('complete');
    expect(files.calls).toEqual(['documents', 'profile spec', 'saveProfile spec']);
    expect(browserWhen).toEqual(['profile: browser not yet open', 'save: browser closed']);
    expect(logs).toContain('profile spec: restored from its archive');
    expect(browser.seeded).toBeNull();
  });

  it('[BRW-31] seeds the browser with the exported sign-in when the files hold a state and no archive', async () => {
    const { browser, logs } = await run({
      ...JOURNEY,
      files: new RecordingSessionFiles({ kind: 'seed', state: SEED }),
    });
    expect(browser.seeded).toEqual(SEED);
    expect(logs).toContain('profile spec: fresh, seeded with its exported sign-in');
    // Files that hold nothing seed nothing and say nothing.
    const plain = await run(JOURNEY);
    expect(plain.browser.seeded).toBeNull();
    expect(plain.logs.filter((line) => line.startsWith('profile spec'))).toEqual([]);
  });

  it('[BRW-32] a save that fails is one warning that changes nothing of the outcome, and a session whose browser never opened keeps nothing', async () => {
    const files = new RecordingSessionFiles();
    files.saveFailing = new Error('bucket unreachable');
    const { outcome, warnings } = await run({ ...JOURNEY, files });
    expect(outcome.status).toBe('complete');
    expect(warnings).toContainEqual(
      expect.stringContaining('profile not saved — bucket unreachable'),
    );
    expect(files.calls).toEqual(['documents', 'profile spec', 'saveProfile spec']);

    // The rubric derivation faults before the browser opens: the archive of the run before stands.
    vi.spyOn(ScriptedBrain.prototype, 'deriveRubric').mockRejectedValue(new Error('loop down'));
    const never = new RecordingSessionFiles();
    const faulted = await run({ ...JOURNEY, files: never });
    expect(faulted.outcome.status).toBe('failed');
    expect(never.calls).toEqual(['documents', 'profile spec']);
  });

  it('[BRW-30] a profile another session holds refuses the run before any file is touched, a row written or a folder opened', async () => {
    const ledger = new InMemoryLedger();
    await ledger.openSession(HELD);
    const files = new RecordingSessionFiles();
    const dumps = new InMemoryDumpStore();
    const refused = run({ ...JOURNEY, ledger, files, dumps });
    await expect(refused).rejects.toThrow(SessionRefused);
    await expect(refused).rejects.toThrow('profile spec is held by session held');
    expect(files.calls).toEqual([]);
    expect(dumps.opened).toBe(0);
    expect([...ledger.sessions.keys()]).toEqual(['held']);
  });

  it('[BRW-34] a session that took the profile while the files were put in place refuses this one at the row, with no row or folder of its own; and a ledger that refuses the row ends the session the same way, the browser never opened', async () => {
    const ledger = new InMemoryLedger();
    const files = new RecordingSessionFiles();
    const dumps = new InMemoryDumpStore();
    // Another task passes the first check as this one does, and writes its row while this one restores the profile.
    const profile = files.profile.bind(files);
    files.profile = async (name) => {
      await ledger.openSession({ ...HELD, startedAt: new Date('2026-10-03T10:00:00.500Z') });
      return profile(name);
    };
    const refused = run({ ...JOURNEY, ledger, files, dumps });
    await expect(refused).rejects.toThrow(SessionRefused);
    await expect(refused).rejects.toThrow('profile spec is held by session held');
    expect(files.calls).toEqual(['documents', 'profile spec']);
    expect(dumps.opened).toBe(0);
    expect([...ledger.sessions.keys()]).toEqual(['held']);

    // The database's own refusal, where the row would have been the second running one on the profile.
    const browser = new FakeBrowser(journeyPages());
    const held = new InMemoryLedger();
    vi.spyOn(held, 'openSession').mockRejectedValue(
      new SessionRefused('profile spec is held by another session whose row was written first'),
    );
    const atRow = run({ ...JOURNEY, ledger: held, browser, files: new RecordingSessionFiles() });
    await expect(atRow).rejects.toThrow('profile spec is held by another session');
    expect(browser.opened).toBeNull();
    expect(held.sessions.size).toBe(0);
  });

  it('[BRW-34] the row beats once more right before the profile is kept, so the lease outlasts a save longer than the stale window', async () => {
    const ledger = new InMemoryLedger();
    const files = new RecordingSessionFiles();
    const beatsAtSave: { beats: number; rowBeat: string | undefined }[] = [];
    const save = files.saveProfile.bind(files);
    files.saveProfile = async (name) => {
      const [row] = [...ledger.sessions.values()];
      beatsAtSave.push({ beats: ledger.heartbeats.length, rowBeat: row?.heartbeatAt });
      return save(name);
    };
    const { outcome, detail } = await run({ ...JOURNEY, ledger, files });
    expect(outcome.status).toBe('complete');
    // The ticker beats on its own timer, far past a spec: the one beat is the save's, on the row before the save ran.
    expect(ledger.heartbeats).toHaveLength(1);
    expect(beatsAtSave).toEqual([{ beats: 1, rowBeat: ledger.heartbeats[0]?.at }]);
    expect(ledger.heartbeats[0]?.steps).toBe(outcome.steps);
    expect(Date.parse(ledger.heartbeats[0]?.at ?? '')).toBeGreaterThan(
      Date.parse(detail.startedAt),
    );
    expect(Date.parse(detail.finishedAt ?? '')).toBeGreaterThan(
      Date.parse(ledger.heartbeats[0]?.at ?? ''),
    );
  });

  it('[BRW-33] waits for the loop after the files and before binding, when told to, and a loop that stays silent refuses the session before any row', async () => {
    const files = new RecordingSessionFiles();
    const loop = new ScriptedLoopProbe();
    const askedWith: string[] = [];
    const health = loop.health.bind(loop);
    loop.health = async () => {
      askedWith.push(`files so far: ${files.calls.join(', ')}`);
      return health();
    };
    const { outcome } = await run({ ...JOURNEY, files, loop, waitForLoopMinutes: 8 });
    expect(outcome.status).toBe('complete');
    expect(askedWith).toEqual(['files so far: documents, profile spec']);
    expect(loop.asks).toBe(1);

    // Every ask fails, and each costs the whole minute: refused after the first.
    const clock = new FixedClock();
    let asks = 0;
    const silent = {
      async health(): Promise<never> {
        asks += 1;
        clock.advance(60_000);
        throw new Error('fetch failed');
      },
    };
    const dumps = new InMemoryDumpStore();
    const refused = run({ ...JOURNEY, loop: silent, waitForLoopMinutes: 1, clock, dumps });
    await expect(refused).rejects.toThrow('the loop did not answer within 1 minute(s)');
    expect(asks).toBe(1);
    expect(dumps.opened).toBe(0);
  });
});
