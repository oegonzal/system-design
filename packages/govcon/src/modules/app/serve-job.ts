import { startPeriodic, type Periodic } from '@sysdesign/contracts';

import { messageOf } from '../../core/text';
import { numberOr } from '../sources/env';

const HOUR_MS = 60 * 60 * 1000;

/** How often a job runs; null never. */
export interface Cadence {
  everyMs: number | null;
}

/** A cadence as the environment spells it, in hours: the fallback when absent or unreadable, and never at zero. */
export const cadenceOfHours = (value: string | undefined, fallbackHours: number): Cadence => {
  const hours = numberOr(value, fallbackHours);
  return { everyMs: hours === 0 ? null : hours * HOUR_MS };
};

/** Where a job's lifecycle is said: a Nest logger, or anything with its two lines. */
export interface JobLog {
  log(message: string): void;
  error(message: string): void;
}

/**
 * The lifecycle of a job `serve()` starts on a cadence — and nothing else
 * does: a module hook would also run it under every CLI command and the
 * HTTP suite. The job runs once at the start and then on its cadence, and is
 * told which of the two a run is. Starting twice starts once; a stop waits
 * for the run in flight, so nothing it holds outlives the store; and once
 * destroyed it starts nothing — a service told to stop while still booting
 * reaches `start` after its store has closed (measured 2026-10-13: that run
 * failed on a destroyed driver).
 */
export class ServeJob {
  private periodic: Periodic | null = null;
  private destroyed = false;

  constructor(
    private readonly name: string,
    private readonly logger: JobLog,
  ) {}

  /** `run` is handed whether this run is one on the cadence, as against the one at the start. */
  start(cadence: Cadence, run: (onCadence: boolean) => Promise<unknown>): void {
    if (this.destroyed || this.periodic !== null) return;
    this.logger.log(
      cadence.everyMs === null
        ? `${this.name} off`
        : `${this.name} every ${cadence.everyMs / HOUR_MS} h`,
    );
    let started = false;
    this.periodic = startPeriodic(
      { everyMs: cadence.everyMs, atStart: true },
      () => {
        const onCadence = started;
        started = true;
        return run(onCadence);
      },
      (error) => this.logger.error(`${this.name} failed: ${messageOf(error)}`),
    );
  }

  /** Safe before start; a run in flight finishes first. */
  async stop(): Promise<void> {
    await this.periodic?.stop();
    this.periodic = null;
  }

  /** The store closes after this: a run in flight is waited for, and none starts afterwards. */
  async destroy(): Promise<void> {
    this.destroyed = true;
    await this.stop();
  }
}
