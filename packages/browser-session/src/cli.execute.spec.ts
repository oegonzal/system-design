import type { BrowserSessionDetailDto } from '@sysdesign/contracts';

import { execute, type CliService, type Io } from './cli';
import { outcome, parsed, REPLAYED, session, taughtAgain } from './cli.testing';
import { SessionRefused } from './core/unit-advice';
import { renderReplayFields } from './render';

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
    exportState: async () => ({ cookies: 0, origins: 0 }),
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

  it('[BRW-31] exports a profile’s sign-in through the service and says how to push it, exiting 2 when a session holds the profile', async () => {
    const { out, sink } = io();
    const asked: [string, string, string][] = [];
    const exportState: CliService['exportState'] = async (profile, file, origins) => {
      asked.push([profile, file, origins.join(',')]);
      return { cookies: 12, origins: 1 };
    };
    expect(
      await execute(
        parsed(['export-state', '--profile', 'linkedin', '--out', '/tmp/linkedin.json']),
        service({ exportState }),
        sink,
      ),
    ).toBe(0);
    expect(asked).toEqual([['linkedin', '/tmp/linkedin.json', 'https://jobs.test']]);
    expect(out[0]).toContain(
      'profile linkedin: 12 cookie(s) written to /tmp/linkedin.json — 1 of the 1 site(s) visited held local storage',
    );
    expect(out[0]).toContain('pnpm aws:files push /tmp/linkedin.json state/linkedin.json');
    expect(out[0]).toContain('then delete it');
    // A profile no launch names: said, so the operator adds --url if the site keeps more than cookies.
    const alone = io();
    await execute(
      parsed(['export-state', '--profile', 'smoke', '--out', '/tmp/s.json']),
      service({ exportState }),
      alone.sink,
    );
    expect(alone.out[0]).toContain(
      'no launch names the profile and no --url was given, so the cookies alone travel',
    );
    const held = io();
    expect(
      await execute(
        parsed(['export-state', '--profile', 'linkedin', '--out', '/tmp/l.json']),
        service({
          exportState: async () => {
            throw new SessionRefused('profile linkedin is held by session s-1');
          },
        }),
        held.sink,
      ),
    ).toBe(2);
    expect(held.errors).toEqual(['profile linkedin is held by session s-1']);
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
