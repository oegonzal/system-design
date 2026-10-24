/**
 * The two ends of a running row's life every run host shares: the beat that
 * keeps the janitor from failing it, and the terminal write that closes it.
 * The beat runs at the loop's one cadence (`heartbeatEveryMs`) on a timer that
 * never holds the process open; the close says once what each outcome means —
 * a row the janitor had already failed is overwritten with the truth, and a
 * row already terminal is left as it is — and never throws.
 */
import { startPeriodic, type Periodic } from '@sysdesign/contracts';

import type { CloseOutcome } from '../../core/ports';
import { heartbeatEveryMs } from './stale-after';

/** Where a host says what it could not write, prefixed with the row it was writing. */
export interface RowLog {
  warn(message: string): void;
  error(message: string): void;
}

export const startHeartbeat = (
  staleAfterMs: number,
  beat: () => Promise<void>,
  label: string,
  log: RowLog,
): Periodic =>
  startPeriodic({ everyMs: heartbeatEveryMs(staleAfterMs), atStart: false }, beat, (error) =>
    log.warn(`${label}: heartbeat not written: ${String(error)}`),
  );

export async function closeRow(
  close: () => Promise<CloseOutcome>,
  label: string,
  log: RowLog,
): Promise<void> {
  try {
    const outcome = await close();
    if (outcome === 'reclaimed') {
      log.warn(
        `${label}: the janitor had failed this row as interrupted; overwrote it with the true outcome`,
      );
    } else if (outcome === 'refused') {
      log.error(`${label}: not persisted: the row is already terminal`);
    }
  } catch (error) {
    log.error(`${label}: not persisted: ${String(error)}`);
  }
}
