import type { LoopProbe, ProfileRestore, SessionFiles } from './ports';

/**
 * The session files and the loop probe as fakes: each records what it was
 * asked and answers from a script. No vitest import, so the Nest spec can
 * use them too.
 */

/** Session files that answer `profile` from a script; `saveFailing` makes the save reject, for the engine's reporting. */
export class RecordingSessionFiles implements SessionFiles {
  readonly calls: string[] = [];
  saveFailing: Error | null = null;

  constructor(private readonly restore: ProfileRestore = { kind: 'none' }) {}

  async profile(name: string): Promise<ProfileRestore> {
    this.calls.push(`profile ${name}`);
    return this.restore;
  }

  async saveProfile(name: string): Promise<void> {
    this.calls.push(`saveProfile ${name}`);
    if (this.saveFailing !== null) throw this.saveFailing;
  }

  async documents(): Promise<void> {
    this.calls.push('documents');
  }
}

/** A loop that fails the first `silentAsks` health checks — every one, for Infinity — then answers; how many times it was asked. */
export class ScriptedLoopProbe implements LoopProbe {
  asks = 0;

  constructor(private readonly silentAsks = 0) {}

  async health(): Promise<{ status: 'ok' }> {
    this.asks += 1;
    if (this.asks <= this.silentAsks) throw new Error('loop unreachable: fetch failed');
    return { status: 'ok' };
  }
}
