import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { CLAUDE_AGENT_TIMEOUT_MS } from '@sysdesign/llm';

import { EvalRunnerService } from './eval-runner.service';

/**
 * The consumer half of the Postgres-backed queue.
 *
 * Claiming is a single atomic UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
 * LOCKED) RETURNING statement, so any number of worker replicas can poll the
 * same table without ever double-claiming — this is the seam a BullMQ/Redis
 * swap would replace, and nothing else.
 *
 * A reaper runs on the same tick: 'running' jobs whose lock has gone stale
 * (worker crashed mid-run) go back to 'queued', which turns a crash into a
 * delay instead of a lost evaluation.
 */
@Injectable()
export class PollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollerService.name);
  private readonly intervalMs = parseInt(process.env['EVAL_POLL_INTERVAL_MS'] ?? '1000', 10);
  /**
   * A lock is stale only once it is older than the longest single step could
   * take: the runner refreshes it at every pass boundary (`lockHeartbeat`), so
   * a live deep eval's lock ages by at most one model call — bounded by the
   * subscription client's hard timeout — plus slack.
   */
  private readonly staleMs = parseInt(
    process.env['EVAL_STALE_RUNNING_MS'] ?? String(CLAUDE_AGENT_TIMEOUT_MS + 60_000),
    10,
  );
  private readonly workerId = `eval-worker-${process.pid}`;

  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly em: EntityManager,
    private readonly runner: EvalRunnerService,
  ) {}

  onModuleInit(): void {
    if (process.env['EVAL_POLLER_DISABLED'] === '1') {
      this.logger.log('poller disabled (EVAL_POLLER_DISABLED=1)');
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

    const jobId = await this.claim(em);
    if (!jobId) return false;

    await this.runner.run(jobId);
    return true;
  }

  private async reapStale(em: EntityManager): Promise<void> {
    await em.getConnection().execute(
      `update "eval_job"
          set status = 'queued', locked_at = null, locked_by = null, updated_at = now()
        where status = 'running'
          and locked_at < now() - make_interval(secs => ?)`,
      [this.staleMs / 1000],
    );
  }

  private async claim(em: EntityManager): Promise<string | null> {
    const rows = await em.getConnection().execute<{ id: string }[]>(
      `update "eval_job" j
          set status = 'running',
              attempts = j.attempts + 1,
              locked_at = now(),
              locked_by = ?,
              updated_at = now()
        where j.id = (
          select id from "eval_job"
           where status = 'queued' and run_after <= now()
           order by created_at
           limit 1
           for update skip locked
        )
        returning j.id`,
      [this.workerId],
    );

    return rows[0]?.id ?? null;
  }
}
