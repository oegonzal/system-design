/**
 * What a spec of a store over pgvector runs against without a database: the
 * vector math the in-memory fakes rank by, so they agree with each other and
 * with pgvector's cosine distance on which row is nearer, and an executor that
 * records every statement and answers from a script. Spec support only:
 * nothing that runs imports it.
 */
import { createHash } from 'node:crypto';

import type { SqlExecutor } from './pgvector';

/** The unit vector a text always maps to — its sha256 bytes, centred and normalised — for a text a spec did not place by hand. */
export function hashedUnitVector(text: string, dimensions: number): number[] {
  const digest = createHash('sha256').update(text, 'utf8').digest();
  const raw = Array.from(
    { length: dimensions },
    (_, index) => (digest[index % digest.length] ?? 0) / 255 - 0.5,
  );
  const norm = Math.hypot(...raw) || 1;
  return raw.map((value) => value / norm);
}

/** Cosine similarity as `1 - (a <=> b)` scores it: the dot product over both norms, and 0 when either vector has none. */
export const cosine = (a: readonly number[], b: readonly number[]): number => {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
  const norms = Math.hypot(...a) * Math.hypot(...b);
  return norms === 0 ? 0 : dot / norms;
};

/** One statement the executor was handed, with the values bound to its placeholders. */
export interface RecordedCall {
  sql: string;
  params: readonly unknown[];
}

/** How the script answers a statement: the rows it returns, or nothing; a throw reaches the caller as the database's would. */
export type ScriptedAnswer = (
  sql: string,
  params: readonly unknown[],
) => readonly unknown[] | undefined;

/** The executor, and every call it took in order — `BEGIN`, `COMMIT` and `ROLLBACK` marking each transaction's edges. */
export interface RecordingExecutor extends SqlExecutor {
  readonly calls: RecordedCall[];
}

/**
 * An executor over no database: `all` returns what the script answers (none
 * is no rows), `one` the first of those, `run` their count as rows affected;
 * `transaction` runs its callback over the same recorder between a `BEGIN`
 * and a `COMMIT`, or a `ROLLBACK` when the callback threw, and rethrows.
 */
export function recordingExecutor(answer: ScriptedAnswer = () => undefined): RecordingExecutor {
  const calls: RecordedCall[] = [];
  const take = (sql: string, params: readonly unknown[] = []): unknown[] => {
    calls.push({ sql, params });
    return [...(answer(sql, params) ?? [])];
  };
  const executor: RecordingExecutor = {
    calls,
    all: async <T>(sql: string, params?: readonly unknown[]) => take(sql, params) as T[],
    one: async <T>(sql: string, params?: readonly unknown[]) =>
      take(sql, params)[0] as T | undefined,
    run: async (sql, params) => ({ affectedRows: take(sql, params).length }),
    transaction: async <T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
      calls.push({ sql: 'BEGIN', params: [] });
      try {
        const result = await fn(executor);
        calls.push({ sql: 'COMMIT', params: [] });
        return result;
      } catch (error) {
        calls.push({ sql: 'ROLLBACK', params: [] });
        throw error;
      }
    },
  };
  return executor;
}
