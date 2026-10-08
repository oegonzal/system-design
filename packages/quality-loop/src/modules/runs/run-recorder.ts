import type { Logger } from '@nestjs/common';
import type { PipelineSummary, RunRecallDto, RunTrace } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describeError } from '@sysdesign/run-dump';

import { summariseExchange, type RunProgress, type RunRecord } from '../../core/contracts';
import type { RunRepository, TraceStore } from '../../core/ports';
import { heartbeatEveryMs } from '../janitor/stale-after';
import type { RunRecallRecorder } from './recall/run-recall';

/** The ports a recorder writes through, and where it says what it could not write. */
export interface RecorderPorts {
  repository: RunRepository;
  recalls: RunRecallRecorder;
  traces: TraceStore;
  logger: Logger;
}

/**
 * What a running run writes as it goes, and how it closes. The row is alive
 * while this process says so — a model call can run for minutes with no
 * exchange to record, so the heartbeat ticks on its own, and the record keeps
 * the same beat so an in-memory reader is handed what the row says. Live
 * writes are chained and never awaited by the loop: order is kept, a slow
 * database never stalls a model call, and a failed write is logged. Each
 * finished iteration is published as it lands — an adopted one at once — so
 * a reader sees the run's progress and not only its end, and a run that
 * throws later still dumps the iterations it recorded. The service decides
 * what runs; this records that it did.
 */
export class RunRecorder {
  private writes: Promise<void> = Promise.resolve();
  private readonly ticker: { stop(): void };

  constructor(
    private readonly record: RunRecord,
    private readonly ports: RecorderPorts,
    staleAfterMs: number,
  ) {
    this.ticker = heartbeatTicker(
      () => {
        this.beat();
        return ports.repository.heartbeat(record.runId);
      },
      staleAfterMs,
      (error) => ports.logger.warn(`run ${record.runId}: heartbeat not written: ${String(error)}`),
    );
  }

  /** Every model exchange, summarised onto the row as it lands. */
  readonly sink = (exchange: LlmExchange): void => {
    this.record.exchanges.push(exchange);
    const summaries = this.record.exchanges.map(summariseExchange);
    this.write('exchange', () =>
      this.ports.repository.recordExchange(this.record.runId, summaries),
    );
  };

  /** Each finished iteration, with the run's standing so far. */
  readonly onIteration = (progress: RunProgress): void => {
    this.record.trace = progress;
    this.write('progress', () => this.ports.repository.recordProgress(this.record.runId, progress));
  };

  /** Each move of the recall, before any stage runs. */
  readonly onRecall = (recall: RunRecallDto): void => {
    this.record.recall = recall;
    this.write('recall', () => this.ports.recalls.recordRecall(this.record.runId, recall));
  };

  /** The loop came to an end: the trace is the run's. */
  complete(trace: RunTrace): void {
    this.record.trace = trace;
    this.record.status = 'complete';
  }

  /** The loop threw: the run failed, with what it recorded kept. */
  fail(error: unknown): void {
    this.record.error = describeError(error);
    this.record.status = 'failed';
    this.ports.logger.error(`run ${this.record.runId} failed: ${this.record.error.message}`);
  }

  /** Stop the beat, settle the times, save the dump, drain the live writes, and close the row with the truth. */
  async close(summary: PipelineSummary): Promise<void> {
    const { record, ports } = this;
    this.ticker.stop();
    record.finishedAt = new Date().toISOString();
    record.heartbeatAt = record.finishedAt;
    ports.traces.save(record, summary);
    await this.writes;
    try {
      const outcome = await ports.repository.close(record);
      if (outcome === 'reclaimed') {
        ports.logger.warn(
          `run ${record.runId}: the janitor had failed this row as interrupted; overwrote it with the true outcome`,
        );
      } else if (outcome === 'refused') {
        ports.logger.error(`run ${record.runId}: not persisted: the row is already terminal`);
      }
    } catch (error) {
      ports.logger.error(`run ${record.runId}: not persisted: ${String(error)}`);
    }
  }

  private beat(): void {
    this.record.heartbeatAt = new Date().toISOString();
  }

  private write(what: string, task: () => Promise<void>): void {
    this.beat();
    this.writes = this.writes
      .then(task)
      .catch((error: unknown) =>
        this.ports.logger.warn(`run ${this.record.runId}: ${what} not recorded: ${String(error)}`),
      );
  }
}

/**
 * An unref'd interval that refreshes a running row's heartbeat at the loop's
 * one cadence (`heartbeatEveryMs`, a few beats per stale threshold), so a
 * long model call never lets the janitor mistake a live run for a dead one.
 * Never awaited; a failed write is only logged.
 */
export function heartbeatTicker(
  beat: () => Promise<void>,
  staleAfterMs: number,
  warn: (error: unknown) => void,
): { stop(): void } {
  const timer = setInterval(() => void beat().catch(warn), heartbeatEveryMs(staleAfterMs));
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
