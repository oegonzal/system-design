import {
  InMemoryLedger,
  LOOP_STORE,
  manifestEntry,
  MEMORY_URL,
  ScriptedSink,
  SPACE_STORE,
} from '../test/fakes';
import { NOTES, options } from '../test/ingest-harness';
import { fixedClock, scriptedReader } from '../test/fakes';
import { ingest, latestByChunk, type IngestDeps } from './ingest';
import type { RecordScope } from '@sysdesign/contracts';
import { covers } from './record';
import { NotInManifest, retractDocuments } from './retract';

/**
 * Two stores: every command reads and acts on the postings made through the
 * configured one — the sink, and for a space the space and the scope written
 * under — and every other's are kept as they are. The space sink here is
 * scripted — the shipping adapter over the memory host is
 * `adapters/space-http/space-ingest-sink.spec.ts`.
 */
const SPACE = { ...SPACE_STORE, host: MEMORY_URL };

/**
 * A space sink answering every post as stored, each under a digest run of its
 * own — named apart from every other sink's by `label`, as the host names each
 * digest run once — with two records: the same two for the same chunk when
 * `sameRecords` is set, as a space answers a fact it already holds `unchanged`.
 */
function spaceSink(
  scope: RecordScope = SPACE.scope,
  sameRecords = false,
  label = '',
): ScriptedSink {
  const sink = new ScriptedSink([], { ...SPACE, scope });
  let posted = 0;
  const post = sink.post.bind(sink);
  sink.post = (planned) => {
    posted += 1;
    sink.records.clear();
    const stem = sameRecords ? planned.chunkHash.slice(0, 8) : String(posted);
    const outcome = {
      orchestrationRunId: `digest-${label}${posted}`,
      status: 'complete' as const,
      digestRunId: `register-digest-${label}${posted}`,
      steps: {
        digest: { status: 'complete' as const, reason: null, note: null, counts: { endorsed: 2 } },
        store: { status: 'complete' as const, reason: null, note: null, counts: { items: 2 } },
      },
      error: null,
      recordIds: [`r-${stem}a`, `r-${stem}b`],
    };
    sink.records.set(outcome.orchestrationRunId, outcome);
    return post(planned).then(() => outcome);
  };
  return sink;
}

const deps = (sink: ScriptedSink, ledger: InMemoryLedger): IngestDeps => ({
  reader: scriptedReader({ 'notes.md': NOTES }),
  sink,
  ledger,
  clock: fixedClock(),
});

/** The loop's postings of the three-chunk document, as an earlier run through the loop left them. */
const loopPostings = (hashes: readonly string[]) =>
  hashes.map((chunkHash, index) =>
    manifestEntry({
      chunkHash,
      chunk: { index: index + 1, of: hashes.length },
      orchestrationRunId: `orch-${index + 1}`,
      digestRunId: `digest-run-${index + 1}`,
    }),
  );

describe('ingest, through one sink while the other holds the document too', () => {
  it('[ING-4] a document posted to the loop is posted whole to a space — nothing of it is covered there — and replacing it there retracts nothing the loop holds, so both stores keep the document', async () => {
    const sink = spaceSink();
    const planned = await ingest(
      ['notes.md'],
      options({ dryRun: true }),
      deps(sink, new InMemoryLedger()),
    );
    const hashes = planned.files[0]?.chunks.map((chunk) => chunk.chunkHash) ?? [];
    const ledger = new InMemoryLedger(loopPostings(hashes));
    expect(latestByChunk(ledger.entries, SPACE_STORE).size).toBe(0);
    expect(latestByChunk(ledger.entries, LOOP_STORE).size).toBe(3);

    const report = await ingest(['notes.md'], options(), deps(sink, ledger));
    expect(report).toMatchObject({ posted: 3, skipped: 0, failed: 0 });
    expect(report.files[0]).toMatchObject({
      replaced: { through: MEMORY_URL, retracted: [], left: null },
      heldBack: null,
    });
    expect(sink.retracted).toEqual([]);
    expect(ledger.entries.slice(3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sink: 'space',
          host: MEMORY_URL,
          spaceId: SPACE.spaceId,
          scope: SPACE.scope,
          recordIds: ['r-1a', 'r-1b'],
          status: 'complete',
        }),
      ]),
    );
    // Every loop posting stands as it was: the space's run covered the document in the space alone.
    expect(
      ledger.entries.slice(0, 3).every((entry) => entry.sink === 'loop' && covers(entry)),
    ).toBe(true);
    expect(latestByChunk(ledger.entries, SPACE_STORE).size).toBe(3);

    // A second run through the space skips what the space's own postings cover.
    const again = await ingest(['notes.md'], options(), deps(sink, ledger));
    expect(again).toMatchObject({ posted: 0, skipped: 3 });
  });

  it('[ING-4] the same space under another tenant is another store: the document is posted whole there, covered there alone, and retiring it there retracts nothing of the first tenant’s', async () => {
    const north = spaceSink();
    const ledger = new InMemoryLedger();
    await ingest(['notes.md'], options(), deps(north, ledger));
    const south = spaceSink({ tenant: 'south' }, false, 'south-');
    const seeded = await ingest(['notes.md'], options(), deps(south, ledger));
    expect(seeded).toMatchObject({ posted: 3, skipped: 0 });
    expect(south.retracted).toEqual([]);
    const times = (count: number, scope: RecordScope) => Array.from({ length: count }, () => scope);
    expect(ledger.entries.map((entry) => entry.scope)).toEqual([
      ...times(3, SPACE.scope),
      ...times(3, { tenant: 'south' }),
    ]);
    expect(latestByChunk(ledger.entries, { ...SPACE_STORE, scope: { tenant: 'south' } }).size).toBe(
      3,
    );

    const retired = await retractDocuments(
      ['notes.md'],
      { dryRun: false, cwd: '/work' },
      {
        sink: south,
        ledger,
        clock: fixedClock(),
      },
    );
    expect(retired.documents[0]).toMatchObject({ entries: 3 });
    expect(north.retracted).toEqual([]);
    expect(
      ledger.entries.filter((entry) => entry.retractedAt !== null).map((e) => e.scope),
    ).toEqual(times(3, { tenant: 'south' }));
  });

  it('[ING-4] replacing a document keeps every record its covering posting lists too — a fact the space answered unchanged is one record, not two — so the earlier run’s retraction closes only what the new one left behind', async () => {
    const sink = spaceSink(SPACE.scope, true);
    const ledger = new InMemoryLedger();
    await ingest(['notes.md'], options(), deps(sink, ledger));
    const first = ledger.entries.map((entry) => entry.recordIds);
    const forced = await ingest(['notes.md'], options({ force: true }), deps(sink, ledger));
    expect(forced).toMatchObject({ posted: 3 });
    // The new postings answered the same records: each earlier run is retracted keeping every record
    // a standing posting still lists — its own chunk's two among them — so the facts stand.
    expect(sink.kept).toHaveLength(3);
    sink.kept.forEach((keep, index) => {
      for (const id of first[index] ?? []) expect(keep).toContain(id);
    });
    expect(forced.files[0]?.replaced?.retracted.map((run) => run.kept)).toEqual([2, 2, 2]);
  });

  it('[ING-4] retiring a document through one sink retires its postings there alone, and a document posted only through the other sink is refused by name', async () => {
    const sink = spaceSink();
    const planned = await ingest(
      ['notes.md'],
      options({ dryRun: true }),
      deps(sink, new InMemoryLedger()),
    );
    const hashes = planned.files[0]?.chunks.map((chunk) => chunk.chunkHash) ?? [];
    const ledger = new InMemoryLedger(loopPostings(hashes));
    await ingest(['notes.md'], options(), deps(sink, ledger));

    const retired = await retractDocuments(
      ['notes.md'],
      { dryRun: false, cwd: '/work' },
      {
        sink,
        ledger,
        clock: fixedClock(),
      },
    );
    expect(retired.documents[0]).toMatchObject({
      entries: 3,
      runs: ['register-digest-1', 'register-digest-2', 'register-digest-3'],
      retraction: { through: MEMORY_URL, left: null },
    });
    expect(sink.retracted).toEqual(['register-digest-1', 'register-digest-2', 'register-digest-3']);
    // Each retraction keeps what the postings still standing list — two others' records, then one's, then none — never its own.
    expect(sink.kept.map((keep) => keep.length)).toEqual([4, 2, 0]);
    expect(
      sink.kept.every((keep, index) => !keep.some((id) => id.startsWith(`r-${index + 1}`))),
    ).toBe(true);
    expect(ledger.entries.filter((entry) => entry.sink === 'loop').every(covers)).toBe(true);
    expect(
      ledger.entries
        .filter((entry) => entry.sink === 'space')
        .every((entry) => entry.retractedAt !== null),
    ).toBe(true);

    const loopOnly = new InMemoryLedger(loopPostings(hashes));
    const refused = retractDocuments(
      ['notes.md'],
      { dryRun: false, cwd: '/work' },
      {
        sink,
        ledger: loopOnly,
        clock: fixedClock(),
      },
    );
    await expect(refused).rejects.toBeInstanceOf(NotInManifest);
    await expect(refused).rejects.toThrow(
      `has no entry for notes.md through the space sink (space ${SPACE.spaceId}, scope tenant=north)`,
    );
    expect(loopOnly.saves).toBe(0);
  });
});
