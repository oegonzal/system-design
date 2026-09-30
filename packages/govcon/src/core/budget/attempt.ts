import type { SourceCallOutcome } from '@sysdesign/contracts';

/**
 * One HTTP attempt as an adapter reports it: the ledger's row minus what the
 * gate adds (the source, the operation, the key, the attempt number). An
 * adapter that retries reports every attempt, so the ledger counts what the
 * provider counted.
 */
export interface AttemptRecord {
  startedAt: Date;
  durationMs: number;
  status: number | null;
  outcome: SourceCallOutcome;
  /** Provider detail, bounded and redacted; null when the attempt succeeded. */
  error: string | null;
}

/** What an adapter answers: every attempt it made, and the result of the last. */
export interface Attempted<T> {
  attempts: AttemptRecord[];
  result: T;
}
