import type { Logger } from '@nestjs/common';
import {
  createWriteQueue,
  type Periodic,
  type PipelineSummary,
  type RunRecallDto,
  type RunTrace,
  type WriteQueue,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describeError } from '@sysdesign/run-dump';

import { summariseExchange, type RunProgress, type RunRecord } from '../../core/contracts';
import type { RunRepository, TraceStore } from '../../core/ports';
import { closeRow, startHeartbeat } from '../janitor/liveness';
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
 * exchange to record, so the heartbeat ticks on its own at the loop's one
 * cadence (`heartbeatEveryMs`, a few beats per stale threshold), and the
 * record keeps the same beat so an in-memory reader is handed what the row
 * says; a beat in flight is let finish before the close is written. Live
 * writes are chained and never awaited by the loop: order is kept, a slow
 * database never stalls a model call, and a failed write is logged. Each
 * finished iteration is published as it lands — an adopted one at once — so
 * a reader sees the run's progress and not only its end, and a run that
 * throws later still dumps the iterations it recorded. The service decides
 * what runs; this records that it did.
 */
export class RunRecorder {
  private readonly writes: WriteQueue;
  private readonly ticker: Periodic;

  constructor(
    private readonly record: RunRecord,
    private readonly ports: RecorderPorts,
    staleAfterMs: number,
  ) {
    this.writes = createWriteQueue((what, error) =>
      ports.logger.warn(`run ${record.runId}: ${what} not recorded: ${String(error)}`),
    );
    this.ticker = startHeartbeat(
      staleAfterMs,
      () => {
        this.beat();
        return ports.repository.heartbeat(record.runId);
      },
      `run ${record.runId}`,
      ports.logger,
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
    await this.ticker.stop();
    record.finishedAt = new Date().toISOString();
    record.heartbeatAt = record.finishedAt;
    ports.traces.save(record, summary);
    await this.writes.drain();
    await closeRow(() => ports.repository.close(record), `run ${record.runId}`, ports.logger);
  }

  private beat(): void {
    this.record.heartbeatAt = new Date().toISOString();
  }

  private write(what: string, task: () => Promise<void>): void {
    this.beat();
    void this.writes.write(what, task);
  }
}
