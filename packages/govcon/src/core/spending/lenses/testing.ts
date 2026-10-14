import { NO_FACETS, type FacetId } from '@sysdesign/contracts';

import { RequestGate } from '../../budget';
import { InMemorySourceCallLog } from '../../testing';
import { SnapshotCache } from '../lens';
import { InMemorySnapshotStore, scriptedSpendingSources, type SpendingScript } from '../testing';
import type { LensDeps } from './deps';

/** The instant every lens spec reads at: period 9 of FY2026. */
export const NOW = new Date('2026-06-15T12:00:00Z');

/** One scope the lens specs start from: machine shops at Defense, both families, nothing narrowed. */
export const SCOPE = {
  naics: ['332710'],
  psc: [],
  agency: '097',
  awardFamily: 'both' as const,
  facets: NO_FACETS,
};

export interface LensHarnessOptions {
  /** The facets the scripted subcontract search declares it cannot honour. */
  unsupportedFacets?: readonly FacetId[];
  /** Advances the clock on every read, so a wall-clock deadline can pass inside one load. */
  tickMs?: number;
}

/**
 * The lenses over scripted ports behind the real gate and the real
 * snapshot cache: every spend is ledgered, and `operations` reads the
 * ledger back in order.
 */
export function harness(script: SpendingScript = {}, options: LensHarnessOptions = {}) {
  const sources = scriptedSpendingSources(script, [], options.unsupportedFacets ?? []);
  const log = new InMemorySourceCallLog();
  let now = NOW;
  const clock = () => {
    now = new Date(now.getTime() + (options.tickMs ?? 0));
    return now;
  };
  const gate = new RequestGate(log, { ttlMs: 0, pullDeadlineMs: 60_000, buckets: {} }, clock);
  const cache = new SnapshotCache(new InMemorySnapshotStore(), 60 * 60 * 1000, clock);
  const deps: LensDeps = {
    sources,
    gate,
    now: clock,
    deadlineMs: 60_000,
    read: (spec, query) => cache.read(spec, query),
  };
  return { deps, sources, operations: () => log.calls.map((call) => call.operation) };
}
