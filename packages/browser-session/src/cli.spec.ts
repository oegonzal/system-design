import type { BrowserSessionDetailDto, BrowserSessionDto } from '@sysdesign/contracts';

import { execute, parseOptions, USAGE, type CliService, type Io, type Options } from './cli';
import { SPEC_RAILS } from './core/testing-session';
import type { SessionOutcome } from './core/session-engine';
import { SessionRefused } from './core/unit-advice';
import type { ReplayFieldsReport } from './modules/session/replay-fields';
import type { TeachAgainReport } from './modules/session/teach-again';
import { renderReplayFields } from './render';
import type { SessionDefaults } from './settings';

/** The settings a parse reads its defaults from. */
const AT_ONCE = { windowMs: 0, pauseMs: 1 };
const DEFAULTS: SessionDefaults = {
  headed: true,
  rails: SPEC_RAILS,
  loopRecovery: AT_ONCE,
  advisorRecovery: AT_ONCE,
  busRecovery: AT_ONCE,
};

const parsed = (argv: string[]): Options => {
  const options = parseOptions(argv, DEFAULTS);
  if (options instanceof Error) throw options;
  return options;
};

const session = (overrides: Partial<BrowserSessionDto> = {}): BrowserSessionDto => ({
  id: 'session-1',
  dumpRunId: '2026-10-03T10-00-00-000-abcdef-session',
  goalPath: 'goals/smoke-search.md',
  goalHash: 'abc123',
  profile: 'smoke',
  subject: null,
  headed: true,
  status: 'complete',
  terminationReason: 'mission-stop',
  terminationCause: 'mission-complete',
  terminationDetail: 'results shown',
  limits: SPEC_RAILS,
  steps: 3,
  startedAt: '2026-10-03T10:00:00.000Z',
  heartbeatAt: '2026-10-03T10:04:00.000Z',
  finishedAt: '2026-10-03T10:04:00.000Z',
  error: null,
  ...overrides,
});

/** What a replay reports, as the fake service answers it. */
const REPLAYED: ReplayFieldsReport = {
  fields: 12,
  pages: 3,
  citedFound: 9,
  cited: 10,
  citedBy: { equal: 7, identity: 2, contained: 0 },
  unitLeak: 0,
  tenantLeak: 0,
  latency: { p50: 120, p90: 310 },
  recordedLatency: { p50: 400, p90: 900 },
  judged: null,
  unresolvedRuns: 1,
  unresolvedOrchestrations: 0,
  retraction: null,
  outDir: 'static/replays/2026-10-24T10-00-00-000-abcdef',
};

/** What teach-again reports, as the fake service answers it: nineteen answers, each its own receipt. */
const taughtAgain = (dryRun: boolean): TeachAgainReport => ({
  dryRun,
  sessions: 2,
  answers: 19,
  documents: 3,
  outcomes: dryRun ? {} : { queued: 19 },
  scopes: { declared: 19, fromDigest: 0, undeclared: 0 },
  stored: dryRun ? 0 : 18,
  retracted: dryRun ? 0 : 4,
  unanswered: 40,
  untaught: 0,
  unreadable: [],
  skipped: ['x-session: 3 answer(s) but 0 teaching(s) — taught without linking rows or retracting'],
});

const outcome = (status: SessionOutcome['status']): SessionOutcome => ({
  sessionId: 'session-1',
  dumpRunId: 'dump-1',
  status,
  termination:
    status === 'failed'
      ? { reason: 'error', detail: 'x' }
      : { reason: 'mission-stop', cause: 'mission-complete', ending: 'complete', detail: 'x' },
  steps: 3,
});

describe('parseOptions', () => {
  it('reads each command against the declared flags', () => {
    expect(parsed(['run', '--goal', 'g.md', '--profile', 'p'])).toEqual({
      command: 'run',
      goalPath: 'g.md',
      profile: 'p',
      headed: true,
      rails: SPEC_RAILS,
      subject: undefined,
      startUrl: undefined,
    });
    // `--url` on run is where the browser opens, so the loop never plans on about:blank.
    expect(
      parsed(['run', '--goal', 'g.md', '--profile', 'p', '--url', 'https://x.test/jobs']),
    ).toMatchObject({ startUrl: 'https://x.test/jobs' });
    expect(
      parsed([
        'run',
        '--goal',
        'g.md',
        '--profile',
        'p',
        '--headless',
        '--max-tasks',
        '2',
        '--max-minutes',
        '5',
        '--max-failures',
        '1',
        '--subject',
        'Alex',
      ]),
    ).toMatchObject({
      headed: false,
      rails: { maxTasks: 2, maxMinutes: 5, maxConsecutiveFailures: 1 },
      subject: 'Alex',
    });
    expect(parsed(['login', '--profile', 'p', '--url', 'https://x.test'])).toEqual({
      command: 'login',
      profile: 'p',
      url: 'https://x.test',
    });
    expect(parsed(['sessions'])).toEqual({ command: 'sessions', limit: 20, json: false });
    expect(parsed(['sessions', '--limit', '3', '--json'])).toEqual({
      command: 'sessions',
      limit: 3,
      json: true,
    });
    expect(parsed(['show', 'abc', '--json'])).toEqual({ command: 'show', id: 'abc', json: true });
    expect(parsed(['replay-events', 'abc'])).toEqual({ command: 'replay-events', id: 'abc' });
    expect(
      parsed(['teach-again', '--sessions', 'static/sessions', '--subject', 'Ada', '--dry-run']),
    ).toEqual({
      command: 'teach-again',
      sessions: 'static/sessions',
      subject: 'Ada',
      tenant: undefined,
      dryRun: true,
    });
    expect(parsed(['teach-again', '--sessions', 'd', '--tenant', 'verify-1'])).toMatchObject({
      subject: undefined,
      tenant: 'verify-1',
      dryRun: false,
    });
    expect(
      parsed([
        'replay-fields',
        '--sessions',
        'static/sessions',
        '--tenant',
        'verify-1',
        '--sample',
        '40',
        '--judge',
        '--retract',
        '20',
        '--out',
        'tmp/replays',
      ]),
    ).toEqual({
      command: 'replay-fields',
      sessions: 'static/sessions',
      tenant: 'verify-1',
      sample: 40,
      judge: true,
      retract: 20,
      out: 'tmp/replays',
    });
    expect(parsed(['replay-fields', '--sessions', 'd'])).toEqual({
      command: 'replay-fields',
      sessions: 'd',
      tenant: undefined,
      sample: null,
      judge: false,
      retract: null,
      out: 'static/replays',
    });
  });

  it.each([
    [[], USAGE],
    [['fly'], USAGE],
    [['run', '--profile', 'p'], '--goal is required'],
    [['run', '--goal', 'g.md'], '--profile is required'],
    [['run', '--goal', 'g.md', '--profile', 'p', '--headed', '--headless'], 'contradict'],
    [
      ['run', '--goal', 'g.md', '--profile', 'p', '--max-tasks', 'x'],
      '--max-tasks must be a positive integer',
    ],
    [['run', '--goal', 'g.md', '--profile', 'p', '--bogus'], "Unknown option '--bogus'"],
    [['login', '--profile', 'p'], '--url is required'],
    [['sessions', '--limit', '0'], '--limit must be a positive integer'],
    [['show'], 'show takes one id'],
    [['show', 'a', 'b'], 'show takes one id'],
    [['sessions', 'extra'], 'sessions takes no positional'],
    [['replay-events'], 'replay-events takes one id'],
    [['teach-again'], '--sessions is required'],
    [['teach-again', 'extra', '--sessions', 'd'], 'teach-again takes no positional'],
    [['replay-fields'], '--sessions is required'],
    [['replay-fields', '--sessions', 'd', '--sample', '0'], '--sample must be a positive integer'],
    [
      ['replay-fields', '--sessions', 'd', '--retract', 'x'],
      '--retract must be a positive integer',
    ],
    [['replay-fields', 'extra', '--sessions', 'd'], 'replay-fields takes no positional'],
    // A flag a command does not read is refused by name, never taken and ignored.
    [
      ['run', '--goal', 'g.md', '--profile', 'p', '--tenant', 'verify-1'],
      "Unknown option '--tenant'",
    ],
    [['teach-again', '--sessions', 'd', '--judge'], "Unknown option '--judge'"],
    [['sessions', '--tenant', 'verify-1'], "Unknown option '--tenant'"],
  ])('refuses %j', (argv, message) => {
    const result = parseOptions(argv, DEFAULTS);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(message);
  });
});

describe('execute', () => {
  const io = () => {
    const out: string[] = [];
    const errors: string[] = [];
    const sink: Io = {
      out: (t) => out.push(t),
      error: (t) => errors.push(t),
      now: () => new Date('2026-10-03T10:05:00.000Z'),
    };
    return { out, errors, sink };
  };
  const detail = (): BrowserSessionDetailDto => ({ ...session(), tasks: [], decisions: [] });
  const service = (overrides: Partial<CliService> = {}): CliService => ({
    run: async () => outcome('complete'),
    login: async () => undefined,
    list: async () => [session()],
    show: async () => detail(),
    replayEvents: async () => 4,
    teachAgain: async () => taughtAgain(false),
    replayFields: async () => REPLAYED,
    ...overrides,
  });

  it('exits 0 for a complete or stopped session and 1 for a failed one', async () => {
    const { out, sink } = io();
    expect(
      await execute(parsed(['run', '--goal', 'g.md', '--profile', 'p']), service(), sink),
    ).toBe(0);
    expect(out[0]).toContain(
      "session session-1 complete after 3 step(s) — the mission's stop mission-complete",
    );
    expect(
      await execute(
        parsed(['run', '--goal', 'g.md', '--profile', 'p']),
        service({ run: async () => outcome('stopped') }),
        io().sink,
      ),
    ).toBe(0);
    expect(
      await execute(
        parsed(['run', '--goal', 'g.md', '--profile', 'p']),
        service({ run: async () => outcome('failed') }),
        io().sink,
      ),
    ).toBe(1);
  });

  it('lists and shows sessions as text or JSON, exiting 1 for an unknown id', async () => {
    const text = io();
    expect(await execute(parsed(['sessions']), service(), text.sink)).toBe(0);
    expect(text.out[0]).toMatch(/id\s+started\s+status/);
    expect(text.out[0]).toContain('session-1');
    const json = io();
    expect(await execute(parsed(['sessions', '--json']), service(), json.sink)).toBe(0);
    expect(JSON.parse(json.out[0] ?? '')).toEqual([session()]);
    const shown = io();
    expect(await execute(parsed(['show', 'session-1']), service(), shown.sink)).toBe(0);
    expect(shown.out[0]).toContain(
      "session session-1 · complete · ended by the mission's stop mission-complete",
    );
    const missing = io();
    expect(
      await execute(parsed(['show', 'nope']), service({ show: async () => null }), missing.sink),
    ).toBe(1);
    expect(missing.errors).toEqual(['no session nope']);
  });

  it('runs a login and reports a thrown error as exit 1', async () => {
    const { out, sink } = io();
    const calls: string[] = [];
    expect(
      await execute(
        parsed(['login', '--profile', 'p', '--url', 'https://x.test']),
        service({
          login: async (profile, url) => {
            calls.push(`${profile} ${url}`);
          },
        }),
        sink,
      ),
    ).toBe(0);
    expect(calls).toEqual(['p https://x.test']);
    expect(out[0]).toContain('profile p closed');
    const down = io();
    expect(
      await execute(
        parsed(['sessions']),
        service({
          list: async () => {
            throw new Error('connection refused');
          },
        }),
        down.sink,
      ),
    ).toBe(1);
    expect(down.errors).toEqual(['connection refused']);
  });

  it('exits 2 for a session refused before it had a row, like a bad flag', async () => {
    const { errors, sink } = io();
    expect(
      await execute(
        parsed(['run', '--goal', 'g.md', '--profile', 'p']),
        service({
          run: async () => {
            throw new SessionRefused(
              'the mission names the advisor record, and no configured advisor answers to it',
            );
          },
        }),
        sink,
      ),
    ).toBe(2);
    expect(errors).toEqual([
      'the mission names the advisor record, and no configured advisor answers to it',
    ]);
  });

  it('publishes a recorded session’s events again, exiting 1 for an unknown id', async () => {
    const { out, sink } = io();
    const replayed: string[] = [];
    expect(
      await execute(
        parsed(['replay-events', 'session-1']),
        service({
          replayEvents: async (id) => {
            replayed.push(id);
            return 4;
          },
        }),
        sink,
      ),
    ).toBe(0);
    expect([replayed, out]).toEqual([
      ['session-1'],
      ['4 event(s) published again for session session-1'],
    ]);
    const missing = io();
    expect(
      await execute(
        parsed(['replay-events', 'nope']),
        service({ replayEvents: async () => null }),
        missing.sink,
      ),
    ).toBe(1);
    expect(missing.errors).toEqual(['no session nope']);
  });
  it('[BRW-17] teaches a folder of dumps again — under the tenant named, when one is — and says what it did, or what it would do', async () => {
    const { out, sink } = io();
    const asked: [string, boolean, string | undefined, string | undefined][] = [];
    const teachAgain: CliService['teachAgain'] = async (dir, dryRun, subject, tenant) => {
      asked.push([dir, dryRun, subject, tenant]);
      return taughtAgain(dryRun);
    };
    expect(
      await execute(
        parsed(['teach-again', '--sessions', 'static/sessions', '--subject', 'Ada']),
        service({ teachAgain }),
        sink,
      ),
    ).toBe(0);
    expect(
      await execute(
        parsed([
          'teach-again',
          '--sessions',
          'static/sessions',
          '--dry-run',
          '--tenant',
          'verify-1',
        ]),
        service({ teachAgain }),
        sink,
      ),
    ).toBe(0);
    expect(asked).toEqual([
      ['static/sessions', false, 'Ada', undefined],
      ['static/sessions', true, undefined, 'verify-1'],
    ]);
    const scopes =
      "scopes: 19 declared · 0 from the earlier digests · 0 undeclared, left to the brain's rule";
    expect(out).toEqual([
      `19 answer(s) in 2 session(s) taught again as 3 document(s): queued 19 — 18 fact(s) kept by the loop's digests, 4 earlier digest(s) retracted; ${scopes}; 40 dump(s) held no answer; x-session: 3 answer(s) but 0 teaching(s) — taught without linking rows or retracting`,
      `19 answer(s) in 2 session(s) would be taught again as 3 document(s); nothing was posted; ${scopes}; 40 dump(s) held no answer; x-session: 3 answer(s) but 0 teaching(s) — taught without linking rows or retracting`,
    ]);
  });

  it('replays a folder of dumps against the memory with the options as given, and renders the report', async () => {
    const { out, sink } = io();
    const asked: unknown[] = [];
    expect(
      await execute(
        parsed([
          'replay-fields',
          '--sessions',
          'static/sessions',
          '--tenant',
          'verify-1',
          '--sample',
          '40',
          '--judge',
        ]),
        service({
          replayFields: async (options) => {
            asked.push(options);
            return REPLAYED;
          },
        }),
        sink,
      ),
    ).toBe(0);
    expect(asked).toEqual([
      {
        sessionsDir: 'static/sessions',
        tenant: 'verify-1',
        sample: 40,
        judge: true,
        retract: null,
        out: 'static/replays',
      },
    ]);
    expect(out).toEqual([renderReplayFields(REPLAYED)]);
  });
});
