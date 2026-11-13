import type { NewSession } from './ports';
import { assertProfileFree, awaitLoop } from './session-start';
import { InMemoryLedger, ScriptedLoopProbe } from './testing';
import { JumpingClock } from './testing-clock';
import { SPEC_RAILS, SPEC_SUBJECT } from './testing-session';
import { SessionRefused } from './unit-advice';

/** Where the spec clock starts: the instant the session under test would open. */
const START = new Date('2026-10-03T10:00:00.000Z');

/** A session another process opened on `profile`, which last beat at `lastBeat`. */
const running = (id: string, profile: string, lastBeat: Date): NewSession => ({
  id,
  dumpRunId: `dump-${id}`,
  goalPath: 'goals/test.md',
  goalHash: 'h',
  goalMarkdown: '# another mission',
  profile,
  subject: SPEC_SUBJECT,
  headed: false,
  limits: SPEC_RAILS,
  startedAt: lastBeat,
});

describe('one session per profile', () => {
  it('[BRW-30] refuses a profile a running session beat on inside the stale window, naming that session, and lets a stale, a closed or another profile’s go', async () => {
    const ledger = new InMemoryLedger();
    await ledger.openSession(running('held', 'linkedin', new Date(START.getTime() - 10_000)));
    await ledger.openSession(running('dead', 'builtin', new Date(START.getTime() - 3_600_000)));
    await ledger.openSession(running('done', 'smoke', new Date(START.getTime() - 1_000)));
    await ledger.closeSession('done', {
      status: 'complete',
      termination: { reason: 'target-reached', detail: 'one done' },
      steps: 1,
      finishedAt: START,
      error: null,
    });
    const deps = { ledger };
    const refused = assertProfileFree(deps, 'linkedin', 60_000, START);
    await expect(refused).rejects.toThrow(SessionRefused);
    await expect(refused).rejects.toThrow(
      'profile linkedin is held by session held, running and last beating at 2026-10-03T09:59:50.000Z: one session per profile',
    );
    await expect(assertProfileFree(deps, 'builtin', 60_000, START)).resolves.toBeUndefined();
    await expect(assertProfileFree(deps, 'smoke', 60_000, START)).resolves.toBeUndefined();
    await expect(assertProfileFree(deps, 'other', 60_000, START)).resolves.toBeUndefined();
    // The line is drawn from the instant given: a minute later the held profile's beat is past it.
    await expect(
      assertProfileFree(deps, 'linkedin', 60_000, new Date(START.getTime() + 60_000)),
    ).resolves.toBeUndefined();
  });
});

describe('a session told to wait for the loop', () => {
  it('[BRW-33] asks the loop every five seconds until it answers, says so once each way, and asks nothing when told nothing', async () => {
    const loop = new ScriptedLoopProbe(3);
    const clock = new JumpingClock();
    const logs: string[] = [];
    await awaitLoop({ loop, clock, log: (text) => logs.push(text) }, 8);
    expect(loop.asks).toBe(4);
    // Three silent asks five seconds apart, then the answer.
    expect(clock.now().toISOString()).toBe('2026-10-03T10:00:15.000Z');
    expect(logs).toEqual([
      'waiting up to 8 minute(s) for the loop — loop unreachable: fetch failed',
      'the loop answered after 4 asks',
    ]);

    const untold = new ScriptedLoopProbe(Infinity);
    await awaitLoop({ loop: untold, clock, log: (text) => logs.push(text) }, 0);
    expect(untold.asks).toBe(0);
    expect(logs).toHaveLength(2);
  });

  it('[BRW-33] refuses by name a loop that stays silent past the minutes, with the last fault', async () => {
    const loop = new ScriptedLoopProbe(Infinity);
    const waiting = awaitLoop({ loop, clock: new JumpingClock(), log: () => undefined }, 1);
    await expect(waiting).rejects.toThrow(SessionRefused);
    await expect(waiting).rejects.toThrow(
      'the loop did not answer within 1 minute(s) — last asked, loop unreachable: fetch failed',
    );
    // Asked at 0, 5, … 60 s: thirteen times in the minute.
    expect(loop.asks).toBe(13);
  });
});
