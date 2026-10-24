/**
 * The record's step ledger. Every transition is flushed at once, on one
 * serial chain, so writes land in order and a failed flush is logged rather
 * than thrown: the record in memory is the truth, and `close()` writes it whole.
 */
import {
  createWriteQueue,
  type OrchestrationRunDto,
  type OrchestrationStepDto,
  type WriteQueue,
} from '@sysdesign/contracts';
import { describeError } from '@sysdesign/run-dump';

import type { StepResult } from './definition';

export class StepLedger {
  private readonly writes: WriteQueue;

  constructor(
    readonly record: OrchestrationRunDto,
    private readonly flush: (record: OrchestrationRunDto) => Promise<void>,
    private readonly now: () => string,
    warn: (message: string) => void = () => undefined,
  ) {
    this.writes = createWriteQueue((what, error) =>
      warn(`${what} not flushed: ${describeError(error).message}`),
    );
  }

  begin(step: string): Promise<void> {
    return this.patch(step, { status: 'running', startedAt: this.now() });
  }

  /** A child opened: appended, so a step that runs several keeps every id in the order they opened. */
  child(step: string, runId: string): Promise<void> {
    return this.patch(step, { runIds: [...this.record.steps[step].runIds, runId] });
  }

  end(step: string, outcome: StepResult): Promise<void> {
    const current = this.record.steps[step];
    return this.patch(step, {
      status: outcome.status,
      reason: outcome.reason ?? null,
      note: outcome.note ?? null,
      counts: outcome.counts ?? current.counts,
      report: outcome.report === undefined ? current.report : outcome.report,
      ...(outcome.runIds ? { runIds: [...outcome.runIds] } : {}),
      finishedAt: this.now(),
    });
  }

  skip(step: string, reason: string, note: string | null = null): Promise<void> {
    return this.end(step, { status: 'skipped', reason, note });
  }

  /** Every flush so far, settled — the terminal write waits on it. */
  settled(): Promise<void> {
    return this.writes.drain();
  }

  /** Apply one transition to the record in memory, then flush the whole record behind every earlier flush. */
  private patch(step: string, patch: Partial<OrchestrationStepDto>): Promise<void> {
    this.record.steps[step] = { ...this.record.steps[step], ...patch };
    return this.writes.write('step', () => this.flush(this.record));
  }
}
