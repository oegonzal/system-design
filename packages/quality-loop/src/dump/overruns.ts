/**
 * What the model seam kept, changed and asked again across one run's calls —
 * the dump's single reading of each call's `salvage`, so the manifest, the
 * index row and run.md repeat one count. The per-call counts are the wire
 * summary's (`summariseExchange`), summed; the fields themselves are listed
 * call by call, as the seam recorded them.
 */
import type { Overrun } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';

import { summariseExchange } from '../core/contracts';

export interface OverrunTally {
  /** Every field written past its target, across every call. */
  overruns: number;
  /** The calls with at least one. */
  calls: number;
  /** Of the overruns, every one past its ceiling, however it was handled. */
  overCeiling: number;
  /** Of those, the prose cut at a word with the marker. */
  cut: number;
  /** Of those, the lists trimmed by whole items. */
  trimmed: number;
  /** Calls whose value was read from the transcript of a turn that ended without a result. */
  salvaged: number;
  /** Calls whose ask named the previous attempt's faults. */
  feedback: number;
}

export function tallyOverruns(exchanges: readonly LlmExchange[]): OverrunTally {
  const tally: OverrunTally = {
    overruns: 0,
    calls: 0,
    overCeiling: 0,
    cut: 0,
    trimmed: 0,
    salvaged: 0,
    feedback: 0,
  };
  for (const exchange of exchanges) {
    const summary = summariseExchange(exchange);
    const overruns = summary.overruns ?? 0;
    tally.overruns += overruns;
    tally.calls += overruns > 0 ? 1 : 0;
    tally.overCeiling += summary.overCeiling ?? 0;
    tally.cut += summary.cut ?? 0;
    tally.trimmed += summary.trimmed ?? 0;
    tally.salvaged += summary.salvagedFrom === 'transcript' ? 1 : 0;
    tally.feedback += summary.feedback ? 1 : 0;
  }
  return tally;
}

/** True when the seam kept, salvaged or asked again anything a reader should see. */
export const anySalvage = (tally: OverrunTally): boolean =>
  tally.overruns + tally.salvaged + tally.feedback > 0;

/** One field a call wrote past its target, with the call that wrote it. */
export interface CallOverrun {
  scope: string;
  ordinal: number;
  overrun: Overrun;
}

/** Every field written past its target, in call order and, within a call, as the seam recorded them. */
export const callOverruns = (exchanges: readonly LlmExchange[]): CallOverrun[] =>
  exchanges.flatMap(({ scope, ordinal, salvage }) =>
    (salvage?.overruns ?? []).map((overrun) => ({ scope, ordinal, overrun })),
  );
