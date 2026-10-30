import {
  InMemoryLedger,
  manifestEntry,
  MEMORY_URL,
  NORTH,
  ScriptedSink,
  settledOutcome,
  SPACE_ID,
  SPACE_STORE,
} from '../test/fakes';
import type { ManifestEntry } from './ports';
import { refreshStatus } from './status';

/** A posting whose wait was lost after the start: the run is known, nothing it reported is. */
const lost = (overrides: Partial<ManifestEntry> = {}): ManifestEntry =>
  manifestEntry({
    chunk: { index: 1, of: 4 },
    digestRunId: null,
    status: 'failed',
    steps: { digest: null, store: null },
    error: 'lost mid-wait',
    ...overrides,
  });

const skipped = {
  status: 'skipped' as const,
  reason: 'upstream-skipped',
  note: 'digest',
  counts: {},
};

describe('refreshStatus', () => {
  it('[ING-1] rewrites what the service has settled by its steps, leaves a running or a lost entry as it was, and counts each', async () => {
    const entries = [
      lost({ chunkHash: 'settled', orchestrationRunId: 'orch-settled' }),
      lost({ chunkHash: 'unstored', orchestrationRunId: 'orch-unstored' }),
      lost({ chunkHash: 'running', orchestrationRunId: 'orch-running' }),
      lost({ chunkHash: 'lost', orchestrationRunId: 'orch-lost' }),
      lost({ chunkHash: 'refused', orchestrationRunId: null, status: 'refused', error: '400' }),
    ];
    const ledger = new InMemoryLedger(entries);
    const sink = new ScriptedSink();
    sink.records.set('orch-settled', settledOutcome({ orchestrationRunId: 'orch-settled' }));
    sink.records.set(
      'orch-unstored',
      settledOutcome({
        orchestrationRunId: 'orch-unstored',
        digestRunId: 'd-2',
        steps: {
          digest: {
            status: 'complete',
            reason: 'no-memories',
            note: null,
            counts: { memories: 0, kept: 0 },
          },
          store: skipped,
        },
      }),
    );
    sink.records.set(
      'orch-running',
      settledOutcome({
        orchestrationRunId: 'orch-running',
        status: 'running',
        digestRunId: null,
        steps: { digest: null, store: null },
      }),
    );

    const refresh = await refreshStatus({ sink, ledger });
    expect(refresh).toMatchObject({ refreshed: 2, running: 1, missing: 1, elsewhere: 0 });
    expect(ledger.saves).toBe(1);
    expect(refresh.entries.map((e) => [e.chunkHash, e.status])).toEqual([
      ['settled', 'complete'],
      ['unstored', 'unstored'],
      ['running', 'failed'],
      ['lost', 'failed'],
      ['refused', 'refused'],
    ]);
    expect(refresh.entries[0]).toMatchObject({
      digestRunId: 'digest-run-1',
      error: null,
      steps: { store: { status: 'complete', counts: { chunks: 3, embedded: 3 } } },
    });
    expect(refresh.entries[1]).toMatchObject({
      digestRunId: 'd-2',
      error: null,
      steps: {
        digest: { status: 'complete', reason: 'no-memories', note: null },
        store: skipped,
      },
    });
    // The running and the lost entries are exactly what the manifest held, byte for byte.
    expect(refresh.entries[2]).toEqual(entries[2]);
    expect(refresh.entries[3]).toEqual(entries[3]);
    expect(refresh.entries[4]).toEqual(entries[4]);
    expect(ledger.entries).toEqual(refresh.entries);
  });

  it('[ING-3] keeps the retraction mark on an entry it rewrites: the loop still reports an orchestration as having stored what was since retracted', async () => {
    const retracted = manifestEntry({
      orchestrationRunId: 'orch-1',
      retractedAt: '2026-10-14T08:00:00.000Z',
      retractedPoints: 7,
    });
    const ledger = new InMemoryLedger([retracted]);
    const sink = new ScriptedSink();
    sink.records.set('orch-1', settledOutcome());

    const refresh = await refreshStatus({ sink, ledger });
    expect(refresh.refreshed).toBe(1);
    expect(ledger.entries).toEqual([retracted]);
    expect(ledger.entries[0]).toMatchObject({
      status: 'complete',
      retractedAt: '2026-10-14T08:00:00.000Z',
      retractedPoints: 7,
    });
  });

  it('[ING-4] reads back only the postings made through the configured store, and keeps every other store’s as they were, counted apart — the other sink’s, another tenant’s in the same space — the records a space posting left included', async () => {
    const space = manifestEntry({
      chunkHash: 'space-1',
      sink: 'space',
      host: MEMORY_URL,
      spaceId: SPACE_ID,
      scope: NORTH,
      orchestrationRunId: 'digest-1',
      digestRunId: null,
      recordIds: [],
      status: 'failed',
      steps: { digest: null, store: null },
      error: 'lost mid-wait',
    });
    const south = manifestEntry({
      ...space,
      chunkHash: 'space-south',
      scope: { tenant: 'south' },
      orchestrationRunId: 'digest-south',
    });
    const loop = lost({ chunkHash: 'loop-1', orchestrationRunId: 'orch-1' });
    const ledger = new InMemoryLedger([space, south, loop]);

    // Through the loop: the space postings are other stores'.
    const loopSink = new ScriptedSink();
    loopSink.records.set('orch-1', settledOutcome());
    const viaLoop = await refreshStatus({ sink: loopSink, ledger });
    expect(viaLoop).toMatchObject({ refreshed: 1, running: 0, missing: 0, elsewhere: 2 });
    expect(viaLoop.entries[0]).toEqual(space);
    expect(viaLoop.entries[2]).toMatchObject({ chunkHash: 'loop-1', status: 'complete' });

    // Through the space under the north tenant: the digest settled and was applied since, so the records it left are read back; the south tenant's posting is another store's.
    const spaceSink = new ScriptedSink([], { ...SPACE_STORE, host: MEMORY_URL });
    spaceSink.records.set(
      'digest-1',
      settledOutcome({
        orchestrationRunId: 'digest-1',
        digestRunId: 'register-digest-1',
        recordIds: ['r-1', 'r-2'],
        steps: {
          digest: { status: 'complete', reason: null, note: null, counts: { endorsed: 2 } },
          store: { status: 'complete', reason: null, note: null, counts: { items: 2 } },
        },
      }),
    );
    const viaSpace = await refreshStatus({ sink: spaceSink, ledger });
    expect(viaSpace).toMatchObject({ refreshed: 1, elsewhere: 2 });
    expect(viaSpace.entries[0]).toMatchObject({
      sink: 'space',
      spaceId: SPACE_ID,
      scope: NORTH,
      status: 'complete',
      digestRunId: 'register-digest-1',
      recordIds: ['r-1', 'r-2'],
      error: null,
    });
    expect(viaSpace.entries[1]).toEqual(south);
    expect(viaSpace.entries[2]).toEqual(viaLoop.entries[2]);
  });
});
