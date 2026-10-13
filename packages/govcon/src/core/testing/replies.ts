/** What a scripted adapter answers with: results, failures, and the attempts either cost. */
import { type Opportunity } from '@sysdesign/contracts';

import type { AttemptRecord, Attempted, Fetched, SourceFailure } from '../budget';
import type { RejectedRecord, SearchPage } from '../ports';
import { T0 } from './basics';

export const okPage = (
  opportunities: Opportunity[],
  totalRecords = opportunities.length,
  rejected: RejectedRecord[] = [],
): Fetched<SearchPage> => ({
  kind: 'ok',
  value: { opportunities, rejected, totalRecords },
  recordCount: opportunities.length + rejected.length,
  totalRecords,
});

export const okText = (text: string): Fetched<string> => ({
  kind: 'ok',
  value: text,
  recordCount: 1,
  totalRecords: null,
});

export const failure = (
  outcome: SourceFailure['outcome'],
  status: number | null,
  message: string,
): SourceFailure => ({ kind: 'error', outcome, status, message });

/** The one attempt a fake makes for a result: 200 when ok, the failure's status otherwise. */
export const attemptOf = (result: Fetched<unknown>, startedAt = T0): AttemptRecord =>
  result.kind === 'ok'
    ? { startedAt, durationMs: 10, status: 200, outcome: 'ok', error: null }
    : {
        startedAt,
        durationMs: 10,
        status: result.status,
        outcome: result.outcome,
        error: result.message,
      };

export const attempted = <T>(
  result: Fetched<T>,
  attempts?: AttemptRecord[],
): Attempted<Fetched<T>> => ({
  attempts: attempts ?? [attemptOf(result)],
  result,
});

/** A reply a scripted adapter gives: a bare result (one attempt) or the attempts spelled out. */
export type Scripted<T> = Fetched<T> | Attempted<Fetched<T>>;

/** A scripted reply as the attempts it stands for. */
export const asAttempted = <T>(reply: Scripted<T>): Attempted<Fetched<T>> =>
  'attempts' in reply ? reply : attempted(reply);
