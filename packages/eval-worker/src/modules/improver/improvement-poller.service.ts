import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

import { ImprovementRunnerService } from './improvement-runner.service';

/**
 * The improvement queue's consumer — a SIBLING of the eval PollerService, not
 * an extension of it, on purpose: an improvement run takes minutes (one LLM
 * call per iteration), and a shared claim loop would starve every eval job
 * behind it — including the very EvalJobs the run itself enqueues for its
 * accepted revisions. Two independent setTimeout chains make that starvation
 * impossible by construction.
 *
 * Same claim discipline as the eval poller: one atomic UPDATE … (SELECT … FOR
 * UPDATE SKIP LOCKED) RETURNING, and a reaper that requeues 'running' rows
 * whose lock went stale. No run_after: a terminally failed run stays failed —
 * the author simply starts another.
 */
@Injectable()
export class ImprovementPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImprovementPollerService.name);
  private readonly intervalMs = parseInt(process.env['IMPROVE_POLL_INTERVAL_MS'] ?? '2000', 10);
  private readonly staleMs = parseInt(process.env['EVAL_STALE_RUNNING_MS'] ?? '300000', 10);
  private readonly workerId = `improve-worker-${process.pid}`;

  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly em: EntityManager,
    private readonly runner: ImprovementRunnerService,
  ) {}

  onModuleInit(): void {
    // One kill switch for both pollers: a harness that silences the queue
    // means "no background claiming", not "no background eval claiming".
    if (process.env['EVAL_POLLER_DISABLED'] === '1') {
      this.logger.log('improvement poller disabled (EVAL_POLLER_DISABLED=1)');
      return;
    }
    this.logger.log(`polling every ${this.intervalMs}ms as ${this.workerId}`);
    this.schedule(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick()
        .catch((error) => this.logger.error(`tick failed: ${error}`))
        .finally(() => this.schedule(this.intervalMs));
    }, delayMs);
    this.timer.unref?.();
  }

  /** One poll cycle. Public so tests can drive it without the timer. */
  async tick(): Promise<boolean> {
    const em = this.em.fork();

    await this.reapStale(em);

    const runId = await this.claim(em);
    if (!runId) return false;

    await this.runner.run(runId);
    return true;
  }

  private async reapStale(em: EntityManager): Promise<void> {
    await em.getConnection().execute(
      `update "improvement_run"
          set status = 'queued', locked_at = null, locked_by = null, updated_at = now()
        where status = 'running'
          and locked_at < now() - make_interval(secs => ?)`,
      [this.staleMs / 1000],
    );
  }

  private async claim(em: EntityManager): Promise<string | null> {
    const rows = await em.getConnection().execute<{ id: string }[]>(
      `update "improvement_run" r
          set status = 'running',
              attempts = r.attempts + 1,
              locked_at = now(),
              locked_by = ?,
              updated_at = now()
        where r.id = (
          select id from "improvement_run"
           where status = 'queued'
           order by created_at
           limit 1
           for update skip locked
        )
        returning r.id`,
      [this.workerId],
    );

    return rows[0]?.id ?? null;
  }
}
