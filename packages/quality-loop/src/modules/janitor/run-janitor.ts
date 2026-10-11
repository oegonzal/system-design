import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { startPeriodic, type Periodic } from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { RunRepository } from '../../core/ports';
import { ORCHESTRATION_RUN_REPOSITORY } from '../orchestration/tokens';
import type { OrchestrationRunRepository } from '../orchestration/ports';
import { RUN_REPOSITORY } from '../runs/tokens';
import type { RunJanitorOptions } from './stale-after';
import { RUN_JANITOR_OPTIONS } from './tokens';

/**
 * The one sweeper (ENG-10). A running row is another process's until its
 * heartbeat goes stale; only then is it failed as Interrupted — at boot and
 * on an interval, never from a process that only reads runs. A row this sweep
 * failed is reclaimed by that process's close() if it ever arrives, so the
 * record ends in the truth.
 */
@Injectable()
export class RunJanitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunJanitor.name);
  private periodic: Periodic | null = null;

  constructor(
    @Inject(RUN_JANITOR_OPTIONS) private readonly options: RunJanitorOptions,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(ORCHESTRATION_RUN_REPOSITORY)
    private readonly orchestrations: OrchestrationRunRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.sweep();
    // On a timer that never holds the process open: a CLI run must still exit when its work is done.
    this.periodic = startPeriodic(
      { everyMs: this.options.intervalMs, atStart: false },
      () => this.sweep(),
      (error) => this.logger.error(`sweep failed: ${describeError(error).message}`),
    );
  }

  /** Before the store closes: the sweep in flight let finish. */
  async onModuleDestroy(): Promise<void> {
    await this.periodic?.stop();
  }

  /** Fail every run and orchestration run whose heartbeat is older than the threshold. */
  /**
   * The two ledgers are swept together and settled apart: they share nothing
   * but the threshold, so one failing is no reason to leave the other
   * unswept — and reporting zero for a sweep that did commit would send the
   * next sweep after rows that are already failed.
   */
  async sweep(): Promise<{ runs: number; orchestrations: number }> {
    const before = new Date(Date.now() - this.options.staleAfterMs);
    const [runs, orchestrations] = await Promise.allSettled([
      this.runs.failStale(before),
      this.orchestrations.failStale(before),
    ]);
    const swept = (outcome: PromiseSettledResult<number>, ledger: string): number => {
      if (outcome.status === 'fulfilled') return outcome.value;
      this.logger.error(`${ledger} sweep failed: ${describeError(outcome.reason).message}`);
      return 0;
    };
    const failed = {
      runs: swept(runs, 'run'),
      orchestrations: swept(orchestrations, 'orchestration run'),
    };
    if (failed.runs + failed.orchestrations > 0) {
      this.logger.warn(
        `failed ${failed.runs} run(s) and ${failed.orchestrations} orchestration run(s) whose heartbeat is older than ${this.options.staleAfterMs} ms`,
      );
    }
    return failed;
  }
}
