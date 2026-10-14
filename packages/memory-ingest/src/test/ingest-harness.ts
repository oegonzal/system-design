import type { IngestDeps, IngestOptions } from '../core/ingest';
import type { IngestReport } from '../core/ingest-report';
import { fakeIngestLoop, type SettleScript } from './fake-ingest-loop';
import { fixedClock, InMemoryLedger, scriptedReader } from './fakes';

/**
 * What the ingest specs share: a document that packs into three chunks, the
 * options a run takes, and one loop — one store — with one ledger for every
 * run a spec makes. Test code only, outside the app build.
 */

/** One bullet of 160 tokens seeded by a word: a part of ~1330 chars when the seed has five letters. */
export const bullet = (seed: string): string =>
  `- ${Array.from({ length: 160 }, (_, i) => `${seed}${i}`).join(' ')}`;

/**
 * Three bullets of ~1330 chars under a 4000-byte budget: the goal's fixed
 * text weighs ~2150 bytes (the kind line included; 2026-10-13, after the
 * tenure and scope-test rules), so one bullet fits with room and two never do
 * — three chunks, one part each.
 */
export const NOTES = ['alpha', 'bravo', 'delta'].map(bullet).join('\n');
export const LOOP_URL = 'http://loop.test';

/** Judged below the bar, and nothing drawn on: the chunk's facts are not in the store. */
export const NOT_ACCEPTED: SettleScript = {
  steps: {
    digest: {
      status: 'complete',
      reason: 'not-accepted',
      runIds: ['not-accepted-run'],
      counts: { memories: 4, kept: 0 },
    },
    store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest' },
  },
};

/**
 * Judged and stored, a memory bound to a unit of work withheld because the
 * document names none: what the digest endorsed is in the store, and the
 * chunk's facts are not all there.
 */
export const FACTS_LEFT_OUT: SettleScript = {
  steps: {
    digest: {
      status: 'complete',
      reason: 'unit-unnamed',
      note: '1 withheld: bound to a unit of work, in a document that names none',
      runIds: ['left-out-run'],
      counts: { memories: 4, kept: 3, 'unit-unnamed': 1 },
    },
    store: { status: 'complete', counts: { chunks: 3 } },
  },
};

/** Judged, accepted, and nothing endorsed: the loop's verdict that the chunk holds no fact to store. */
export const NO_FACTS: SettleScript = {
  steps: {
    digest: {
      status: 'complete',
      reason: 'no-memories',
      runIds: ['no-facts-run'],
      counts: { memories: 0, kept: 0 },
    },
    store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest' },
  },
};

export const options = (overrides: Partial<IngestOptions> = {}): IngestOptions => ({
  kind: 'notes',
  subject: 'Ada Lovelace',
  chunkBytes: 4000,
  partsPerChunk: 8,
  date: null,
  scope: null,
  limit: null,
  dryRun: false,
  force: false,
  cwd: '/work',
  ...overrides,
});

/**
 * One loop — one store — and one ledger, for every run a spec makes: a later
 * ingest goes through the same deps, so each posting's digest run is its own
 * and the fake's counts run on.
 */
export function harness(script: readonly SettleScript[] = []) {
  const fake = fakeIngestLoop(script);
  const ledger = new InMemoryLedger();
  const deps: IngestDeps = {
    reader: scriptedReader({ 'notes.md': NOTES }),
    sink: fake.sink,
    ledger,
    clock: fixedClock(),
    loopUrl: LOOP_URL,
  };
  return { ...fake, ledger, deps };
}

/** Each chunk's outcome, document after document. */
export const outcomes = (report: IngestReport) =>
  report.files.flatMap((file) => file.chunks.map((chunk) => chunk.outcome));
