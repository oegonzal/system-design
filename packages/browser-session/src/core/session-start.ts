import { describeError } from '@sysdesign/run-dump';

import type { SessionDeps } from './engine-context';
import { SessionRefused } from './unit-advice';

/**
 * What a session settles before it binds anything: that no other session
 * holds its profile, and — when told to wait — that the loop is there. Both
 * are refusals before any row, beat, dump folder or browser exists, so
 * nothing is left behind to clean up.
 */

/** How often the loop is asked again while the session waits for it. */
const LOOP_ASK_EVERY_MS = 5_000;

/**
 * One session per profile. Two browsers on one profile corrupt it — Chrome
 * refuses the second, and two tasks in the cloud would each archive their
 * own copy over the other's — so a profile a running session beat on inside
 * the declared stale window, counted back from `now`, is held, and this
 * session is refused naming that one, before any of the profile's files are
 * touched — and once more on the instant its own row takes, since minutes
 * may pass between the two. A session that stopped beating holds nothing:
 * the start-of-session sweep closes it as interrupted. What the check cannot
 * see — a row written between the check and this session's — the ledger
 * refuses, with the same refusal.
 */
export async function assertProfileFree(
  deps: Pick<SessionDeps, 'ledger'>,
  profile: string,
  staleAfterMs: number,
  now: Date,
): Promise<void> {
  const line = new Date(now.getTime() - staleAfterMs);
  const live = await deps.ledger.liveSessionOn(profile, line);
  if (live !== null) {
    throw new SessionRefused(
      `profile ${profile} is held by session ${live.id}, running and last beating at ${live.heartbeatAt}: one session per profile — wait for it to end, or stop it`,
    );
  }
}

/**
 * The loop waited for, when the session is told to: in the cloud the loop's
 * task may still be waking as the session starts, and a session that asked
 * it then would fault before its first plan. Asked every five seconds until
 * it answers or the minutes run out — then refused by name, with the last
 * fault. Told nothing, the session binds at once, as on the laptop.
 */
export async function awaitLoop(
  deps: Pick<SessionDeps, 'loop' | 'clock' | 'log'>,
  minutes: number,
): Promise<void> {
  if (minutes === 0) return;
  const deadline = deps.clock.now().getTime() + minutes * 60_000;
  let fault = '';
  for (let asks = 1; ; asks += 1) {
    try {
      await deps.loop.health();
      if (asks > 1) deps.log(`the loop answered after ${asks} asks`);
      return;
    } catch (error) {
      fault = describeError(error).message;
    }
    if (deps.clock.now().getTime() >= deadline) {
      throw new SessionRefused(
        `the loop did not answer within ${minutes} minute(s) — last asked, ${fault}`,
      );
    }
    if (asks === 1) deps.log(`waiting up to ${minutes} minute(s) for the loop — ${fault}`);
    await new Promise<void>((resolve) =>
      deps.clock.at(new Date(deps.clock.now().getTime() + LOOP_ASK_EVERY_MS), resolve),
    );
  }
}
