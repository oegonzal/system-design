import {
  FIXED_NOW,
  InMemoryLedger,
  ScriptedSink,
  settledOrchestration,
  stepOf,
} from '../test/fakes';
import type { ManifestEntry } from './ports';
import { refreshStatus } from './status';

const entry = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  chunkHash: 'abc',
  document: 'notes.md',
  chunk: { index: 1, of: 4 },
  kind: 'notes',
  orchestrationRunId: 'orch-1',
  digestRunId: null,
  status: 'failed',
  steps: { digest: null, store: null },
  error: 'lost mid-wait',
  ingestedAt: FIXED_NOW,
  loopUrl: 'http://loop.test',
  ...overrides,
});

describe('refreshStatus', () => {
  it('[ING-1] rewrites what the loop has settled by its steps, leaves a running or a lost entry as it was, and counts each', async () => {
    const entries = [
      entry({ chunkHash: 'settled', orchestrationRunId: 'orch-settled' }),
      entry({ chunkHash: 'unstored', orchestrationRunId: 'orch-unstored' }),
      entry({ chunkHash: 'running', orchestrationRunId: 'orch-running' }),
      entry({ chunkHash: 'lost', orchestrationRunId: 'orch-lost' }),
      entry({ chunkHash: 'refused', orchestrationRunId: null, status: 'refused', error: '400' }),
    ];
    const ledger = new InMemoryLedger(entries);
    const sink = new ScriptedSink();
    sink.records.set('orch-settled', settledOrchestration({ orchestrationRunId: 'orch-settled' }));
    sink.records.set(
      'orch-unstored',
      settledOrchestration({
        orchestrationRunId: 'orch-unstored',
        steps: {
          digest: stepOf({
            reason: 'no-memories',
            runIds: ['d-2'],
            counts: { memories: 0, kept: 0 },
          }),
          store: stepOf({ status: 'skipped', reason: 'upstream-skipped', note: 'digest' }),
        },
      }),
    );
    sink.records.set(
      'orch-running',
      settledOrchestration({ orchestrationRunId: 'orch-running', status: 'running', steps: {} }),
    );

    const refresh = await refreshStatus({ sink, ledger });
    expect(refresh).toMatchObject({ refreshed: 2, running: 1, missing: 1 });
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
        store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest' },
      },
    });
    // The running and the lost entries are exactly what the manifest held, byte for byte.
    expect(refresh.entries[2]).toEqual(entries[2]);
    expect(refresh.entries[3]).toEqual(entries[3]);
    expect(refresh.entries[4]).toEqual(entries[4]);
  });
});
