import type { BrowserSessionDetailDto, BrowserSessionDto } from '@sysdesign/contracts';

import { execute, parseOptions, USAGE, type CliService, type Io, type Options } from './cli';
import { DEFAULT_RAILS } from './config';
import type { SessionOutcome } from './core/session-engine';

const parsed = (argv: string[]): Options => {
  const options = parseOptions(argv);
  if (options instanceof Error) throw options;
  return options;
};

const session = (overrides: Partial<BrowserSessionDto> = {}): BrowserSessionDto => ({
  id: 'session-1',
  dumpRunId: '2026-10-03T10-00-00-000-abcdef-session',
  goalPath: 'goals/smoke-search.md',
  goalHash: 'abc123',
  profile: 'smoke',
  headed: true,
  status: 'complete',
  terminationReason: 'mission-complete',
  terminationDetail: 'results shown',
  limits: DEFAULT_RAILS,
  steps: 3,
  startedAt: '2026-10-03T10:00:00.000Z',
  heartbeatAt: '2026-10-03T10:04:00.000Z',
  finishedAt: '2026-10-03T10:04:00.000Z',
  error: null,
  ...overrides,
});

const outcome = (status: SessionOutcome['status']): SessionOutcome => ({
  sessionId: 'session-1',
  dumpRunId: 'dump-1',
  status,
  termination: { reason: status === 'failed' ? 'error' : 'mission-complete', detail: 'x' },
  steps: 3,
});

describe('parseOptions', () => {
  it('reads each command against the declared flags', () => {
    expect(parsed(['run', '--goal', 'g.md', '--profile', 'p'])).toEqual({
      command: 'run',
      goalPath: 'g.md',
      profile: 'p',
      headed: true,
      rails: DEFAULT_RAILS,
      subject: undefined,
    });
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
  ])('refuses %j', (argv, message) => {
    const result = parseOptions(argv);
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
    ...overrides,
  });

  it('exits 0 for a complete or stopped session and 1 for a failed one', async () => {
    const { out, sink } = io();
    expect(
      await execute(parsed(['run', '--goal', 'g.md', '--profile', 'p']), service(), sink),
    ).toBe(0);
    expect(out[0]).toContain('session session-1 complete after 3 step(s) — mission-complete');
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
    expect(shown.out[0]).toContain('session session-1 · complete · ended by mission-complete');
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
});
