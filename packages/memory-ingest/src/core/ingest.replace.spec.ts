import { LoopRefused } from '@sysdesign/loop-client';

import {
  FIXED_NOW,
  LOOP_STORE,
  manifestEntry,
  scriptedReader,
  type InMemoryLedger,
} from '../test/fakes';
import {
  bullet,
  FACTS_LEFT_OUT,
  harness,
  LOOP_URL,
  NO_FACTS,
  NOT_ACCEPTED,
  NOTES,
  options,
  outcomes,
} from '../test/ingest-harness';
import { ingest, latestByChunk } from './ingest';
import type { IngestSink } from './ports';
import { covers } from './record';
import { retractDocuments } from './retract';

/** The notes with the second bullet rewritten to the same length: one chunk changes, two stay. */
const EDITED = ['alpha', 'gamma', 'delta'].map(bullet).join('\n');

/** The digest runs whose postings the saved ledger holds as covering, in the order recorded — one document's when named. */
const standing = (ledger: InMemoryLedger, document?: string): (string | null)[] =>
  ledger.entries
    .filter((entry) => covers(entry) && (document === undefined || entry.document === document))
    .map((entry) => entry.digestRunId);

/** A digest run retracted through the configured loop, with the points it removed; the loop keeps no record for another posting. */
const retracted = (digestRunId: string, removed = 3) => ({
  digestRunId,
  removed,
  kept: 0,
  recordedUnder: null,
});

/** The sink, with every call it is asked to make written down in the order it is asked. */
const recording = (sink: IngestSink, calls: string[]): IngestSink => ({
  kind: sink.kind,
  host: sink.host,
  spaceId: sink.spaceId,
  scope: sink.scope,
  post: (planned) => {
    calls.push('post');
    return sink.post(planned);
  },
  status: (entry) => sink.status(entry),
  retract: (entry, keep) => {
    calls.push(`retract ${entry.digestRunId}`);
    return sink.retract(entry, keep);
  },
});

/**
 * Make before break: once every chunk of a document's current plan is covered,
 * the document's other digests are retracted and marked; until then, nothing
 * of it goes, and the report says what held it back.
 */
describe('ingest, replacing a document', () => {
  it('[ING-1] [ING-3] a re-run skips what the document’s postings cover, and --force posts the whole document again before it retracts the earlier digests, marking and saving each', async () => {
    const { deps, posted, loop, client, ledger } = harness();
    await ingest(['notes.md'], options(), deps);

    const skipped = await ingest(['notes.md'], options(), deps);
    expect(skipped).toMatchObject({ chunks: 3, posted: 0, skipped: 3, failed: 0 });
    expect(posted).toHaveLength(3);
    expect(outcomes(skipped)).toEqual(['skipped', 'skipped', 'skipped']);
    expect(skipped.files[0]?.chunks[0]).toMatchObject({
      orchestrationRunId: ledger.entries[0]?.orchestrationRunId,
      status: 'complete',
      steps: ledger.entries[0]?.steps,
    });
    expect(skipped.files[0]?.replaced).toEqual({ through: LOOP_URL, retracted: [], left: null });
    expect(loop.retracted).toEqual([]);

    const calls: string[] = [];
    const report = await ingest(['notes.md'], options({ force: true }), {
      ...deps,
      sink: recording(deps.sink, calls),
    });
    expect(report).toMatchObject({ force: true, posted: 3, skipped: 0 });
    // Make before break: the document is posted whole, and only then does anything of it go.
    expect(calls).toEqual([
      'post',
      'post',
      'post',
      'retract digest-run-1',
      'retract digest-run-2',
      'retract digest-run-3',
    ]);
    expect(report.files[0]?.replaced).toEqual({
      through: LOOP_URL,
      retracted: [retracted('digest-run-1'), retracted('digest-run-2'), retracted('digest-run-3')],
      left: null,
    });
    // Three postings, then a save after each of the three retractions — never one batched behind them.
    expect(ledger.saves).toBe(3 + 3 + 3);
    expect(ledger.entries).toHaveLength(6);
    expect(
      ledger.entries.slice(0, 3).map((entry) => [entry.retractedAt, entry.retractedPoints]),
    ).toEqual([
      [FIXED_NOW, 3],
      [FIXED_NOW, 3],
      [FIXED_NOW, 3],
    ]);
    expect(standing(ledger)).toEqual(['digest-run-4', 'digest-run-5', 'digest-run-6']);
    expect([...client.points.keys()]).toEqual(['digest-run-4', 'digest-run-5', 'digest-run-6']);
    expect(latestByChunk(ledger.entries, LOOP_STORE).size).toBe(3);
  });

  it('[ING-3] an edited document posts the chunks the edit changed and, once every chunk is covered, retracts only the digests they replaced', async () => {
    const { deps, posted, loop, ledger } = harness();
    await ingest(['notes.md'], options(), deps);

    deps.reader = scriptedReader({ 'notes.md': EDITED });
    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({ posted: 1, skipped: 2, failed: 0 });
    expect(outcomes(report)).toEqual(['skipped', 'posted', 'skipped']);
    expect(posted).toHaveLength(4);
    expect(loop.retracted).toEqual(['digest-run-2']);
    expect(report.files[0]?.replaced).toEqual({
      through: LOOP_URL,
      retracted: [retracted('digest-run-2')],
      left: null,
    });
    expect(ledger.entries[1]).toMatchObject({
      digestRunId: 'digest-run-2',
      retractedAt: FIXED_NOW,
      retractedPoints: 3,
    });
    expect(standing(ledger)).toEqual(['digest-run-1', 'digest-run-3', 'digest-run-4']);
  });

  it('[ING-3] replacement goes by the document, so a change that renames every chunk still takes the earlier facts with it — and a dry run, or another document, retracts nothing of it', async () => {
    const { deps, loop, ledger } = harness();
    await ingest(['notes.md'], options(), deps);
    // A new date renders a new head on every chunk, as a change to the goal's rules does: no hash is known.
    const renamed = options({ date: '2026-10-13' });

    const dry = await ingest(['notes.md'], { ...renamed, force: true, dryRun: true }, deps);
    expect(dry).toMatchObject({ dryRun: true, posted: 0, skipped: 0 });
    expect(dry.files[0]).toMatchObject({ replaced: null, heldBack: null });
    expect(loop.retracted).toEqual([]);

    // Another document stands on postings of its own; notes.md's are not its to retract.
    deps.reader = scriptedReader({
      'notes.md': NOTES,
      'other.md': NOTES.replace(/alpha/g, 'omega'),
    });
    await ingest(['other.md'], options(), deps);
    expect(loop.retracted).toEqual([]);

    const report = await ingest(['notes.md'], renamed, deps);
    expect(report).toMatchObject({ posted: 3, skipped: 0 });
    expect(loop.retracted).toEqual(['digest-run-1', 'digest-run-2', 'digest-run-3']);
    expect(standing(ledger)).toEqual([
      'digest-run-4',
      'digest-run-5',
      'digest-run-6',
      'digest-run-7',
      'digest-run-8',
      'digest-run-9',
    ]);
  });

  it('[ING-3] a document the run did not cover whole keeps everything it had — halted, failed or refused — the report naming the chunk that held it back and the earlier runs still standing, and the run that covers it whole replaces the rest', async () => {
    const { deps, client, loop, ledger, script } = harness();
    await ingest(['notes.md'], options(), deps);
    const before = standing(ledger);
    const renamed = options({ date: '2026-10-13' });

    const halted = await ingest(['notes.md'], { ...renamed, limit: 1 }, deps);
    script({ fail: 'the digest threw' });
    const failed = await ingest(['notes.md'], renamed, deps);
    client.refuseNextStart = new LoopRefused(400, 'the goal carries no document index');
    const refused = await ingest(['notes.md'], renamed, deps);
    expect(outcomes(halted)).toEqual(['posted', 'pending', 'pending']);
    expect(outcomes(failed)).toEqual(['skipped', 'failed', 'posted']);
    expect(outcomes(refused)).toEqual(['skipped', 'refused', 'pending']);
    expect([halted, failed, refused].map((report) => report.files[0]?.heldBack)).toEqual([
      { chunk: 2, outcome: 'pending', earlierRuns: 3 },
      { chunk: 2, outcome: 'failed', earlierRuns: 3 },
      { chunk: 2, outcome: 'refused', earlierRuns: 3 },
    ]);
    for (const report of [halted, failed, refused]) expect(report.files[0]?.replaced).toBeNull();
    expect(loop.retracted).toEqual([]);
    expect(standing(ledger)).toEqual([...before, 'digest-run-4', 'digest-run-5']);

    const whole = await ingest(['notes.md'], renamed, deps);
    expect(outcomes(whole)).toEqual(['skipped', 'posted', 'skipped']);
    expect(whole.files[0]?.heldBack).toBeNull();
    expect(loop.retracted).toEqual(before);
    expect(standing(ledger)).toEqual(['digest-run-4', 'digest-run-5', 'digest-run-6']);
  });

  it('[ING-3] a chunk settled with no fact to store covers it, so its document is replaced; one settled with its facts out of the store — none stored, or the rest stored with some withheld — holds the replacement back, the report naming the chunk and the earlier runs that still stand', async () => {
    const { deps, loop, ledger, script } = harness();
    await ingest(['notes.md'], options(), deps);
    deps.reader = scriptedReader({ 'notes.md': EDITED });

    script(NOT_ACCEPTED);
    const held = await ingest(['notes.md'], options(), deps);
    expect(outcomes(held)).toEqual(['skipped', 'unstored', 'skipped']);
    // The edited chunk's earlier digest still stands: the new one is not in the store.
    expect(held.files[0]).toMatchObject({
      replaced: null,
      heldBack: { chunk: 2, outcome: 'unstored', earlierRuns: 1 },
    });
    // Stored, a fact of the chunk withheld: not covered either, so posted again and held back.
    script(FACTS_LEFT_OUT);
    const partial = await ingest(['notes.md'], options(), deps);
    expect(outcomes(partial)).toEqual(['skipped', 'unstored', 'skipped']);
    expect(partial.files[0]).toMatchObject({ replaced: null, heldBack: { chunk: 2 } });
    expect(loop.retracted).toEqual([]);

    script(NO_FACTS);
    const replaced = await ingest(['notes.md'], options(), deps);
    expect(outcomes(replaced)).toEqual(['skipped', 'no-facts', 'skipped']);
    expect(replaced.files[0]?.heldBack).toBeNull();
    // The edit's earlier digest goes, and so do the runs that judged the chunk and left its facts out.
    expect(loop.retracted).toEqual(['digest-run-2', 'not-accepted-run', 'left-out-run']);
    expect(standing(ledger)).toEqual(['digest-run-1', 'digest-run-3', 'no-facts-run']);
  });

  it('[ING-3] replacing a document goes by retiring’s rule — every digest run its entries name, a failed posting’s too, except what its plan stands on and what is marked — and counts the entries whose digest run was never read', async () => {
    const { deps, client, loop, ledger } = harness();
    ledger.entries = [
      // Failed after its digest stored: a restart lost the store step's record, not its points.
      manifestEntry({
        chunkHash: 'earlier-1',
        digestRunId: 'failed-run',
        status: 'failed',
        steps: {
          digest: {
            status: 'complete',
            reason: null,
            note: null,
            counts: { memories: 2, kept: 2 },
          },
          store: null,
        },
        error: 'the quality loop no longer has the run',
      }),
      // A wait lost after the start: the orchestration is known, its digest run is not.
      manifestEntry({
        chunkHash: 'earlier-2',
        digestRunId: null,
        status: 'failed',
        steps: { digest: null, store: null },
        error: 'lost mid-wait',
      }),
      // Retracted before: not asked again.
      manifestEntry({
        chunkHash: 'earlier-3',
        digestRunId: 'marked-run',
        retractedAt: FIXED_NOW,
        retractedPoints: 2,
      }),
    ];
    client.points.set('failed-run', 2);

    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({ posted: 3, failed: 0 });
    expect(loop.retracted).toEqual(['failed-run']);
    expect(report.files[0]).toMatchObject({
      replaced: { retracted: [retracted('failed-run', 2)], left: null },
      unresolved: 1,
    });
  });

  it('[ING-1] [ING-3] a document skips onto its own postings alone: the same text in two files of one name, in different directories, is posted once for each, and replacing or retiring one leaves the other standing', async () => {
    const { deps, posted, loop, ledger } = harness();
    // Both read the same text under the same file name: the same goals, chunk for chunk.
    const both = await ingest(['a/notes.md', 'b/notes.md'], options(), deps);
    expect(both).toMatchObject({ posted: 6, skipped: 0 });
    expect(both.files[1]?.chunks.map((chunk) => chunk.chunkHash)).toEqual(
      both.files[0]?.chunks.map((chunk) => chunk.chunkHash),
    );
    expect(standing(ledger, 'b/notes.md')).toEqual([
      'digest-run-4',
      'digest-run-5',
      'digest-run-6',
    ]);

    // An edit of one replaces its own earlier digest alone.
    deps.reader = scriptedReader({ '/work/a/notes.md': EDITED, 'notes.md': NOTES });
    await ingest(['a/notes.md'], options(), deps);
    expect(loop.retracted).toEqual(['digest-run-2']);

    // Retiring it takes nothing the other stands on: that one is whole, and a re-run of it posts nothing.
    await retractDocuments(['a/notes.md'], { dryRun: false, cwd: '/work' }, deps);
    expect(loop.retracted).toEqual([
      'digest-run-2',
      'digest-run-1',
      'digest-run-3',
      'digest-run-7',
    ]);
    expect(standing(ledger, 'b/notes.md')).toEqual([
      'digest-run-4',
      'digest-run-5',
      'digest-run-6',
    ]);
    const again = await ingest(['b/notes.md'], options(), deps);
    expect(again).toMatchObject({ posted: 0, skipped: 3 });
    expect(posted).toHaveLength(7);
  });

  it('[ING-3] a document that reads as no text replaces nothing — retiring one is retract’s — and one the run stopped before is neither replaced nor held back', async () => {
    const { deps, client, loop } = harness();
    await ingest(['notes.md'], options(), deps);

    deps.reader = scriptedReader({ 'notes.md': '' });
    const empty = await ingest(['notes.md'], options(), deps);
    expect(empty).toMatchObject({ chunks: 0, posted: 0 });
    expect(empty.files[0]).toMatchObject({ chunks: [], replaced: null, heldBack: null });
    expect(loop.retracted).toEqual([]);

    deps.reader = scriptedReader({ 'notes.md': EDITED, 'other.md': NOTES });
    client.refuseNextStart = new LoopRefused(400, 'the goal carries no document index');
    const stopped = await ingest(['notes.md', 'other.md'], options(), deps);
    expect(outcomes(stopped)).toEqual([
      'skipped',
      'refused',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(stopped.files.map((file) => [file.replaced, file.heldBack])).toEqual([
      [null, { chunk: 2, outcome: 'refused', earlierRuns: 1 }],
      [null, null],
    ]);
    expect(loop.retracted).toEqual([]);
  });

  it('[ING-3] after --force --limit 1, a plain re-run keeps the earlier digests of the chunks the forced run did not reach — it skips every covered chunk and replaces only the one posted again — while re-running with --force posts the whole document again', async () => {
    const { deps, posted, loop, client, ledger } = harness();
    await ingest(['notes.md'], options(), deps);

    const forced = await ingest(['notes.md'], options({ force: true, limit: 1 }), deps);
    expect(forced).toMatchObject({ force: true, posted: 1, halted: { reason: 'limit', after: 1 } });
    // The first chunk's earlier digest stands beside its new one until the document is covered whole.
    expect(forced.files[0]).toMatchObject({
      replaced: null,
      heldBack: { chunk: 2, outcome: 'pending', earlierRuns: 1 },
    });
    expect(loop.retracted).toEqual([]);

    const plain = await ingest(['notes.md'], options(), deps);
    expect(plain).toMatchObject({ posted: 0, skipped: 3, halted: null });
    expect(posted).toHaveLength(4);
    // Chunks 2 and 3 were never digested again: they stand on the digests they had before the forced run.
    expect(loop.retracted).toEqual(['digest-run-1']);
    expect(standing(ledger)).toEqual(['digest-run-2', 'digest-run-3', 'digest-run-4']);
    expect([...client.points.values()]).toEqual([3, 3, 3]);

    const again = await ingest(['notes.md'], options({ force: true }), deps);
    expect(again).toMatchObject({ posted: 3, skipped: 0 });
    expect(posted).toHaveLength(7);
    expect(loop.retracted).toEqual([
      'digest-run-1',
      'digest-run-2',
      'digest-run-3',
      'digest-run-4',
    ]);
    expect(standing(ledger)).toEqual(['digest-run-5', 'digest-run-6', 'digest-run-7']);
  });

  it('[ING-3] a replacement the loop does not carry out leaves the rest standing and says why, every retraction before it marked and saved, and the next run that covers the document whole retracts the rest', async () => {
    const { deps, client, ledger } = harness();
    await ingest(['notes.md'], options(), deps);
    client.failingRetractions.set('digest-run-2', new LoopRefused(503, 'the store is unavailable'));

    const forced = await ingest(['notes.md'], options({ force: true }), deps);
    expect(forced.files[0]?.replaced).toEqual({
      through: LOOP_URL,
      retracted: [retracted('digest-run-1')],
      left: {
        digestRunIds: ['digest-run-2', 'digest-run-3'],
        error: '503: the store is unavailable',
      },
    });
    // The first mark was saved before the second retraction was asked.
    expect(ledger.entries[0]).toMatchObject({ retractedAt: FIXED_NOW, retractedPoints: 3 });
    expect(ledger.entries.slice(1, 3).map((entry) => entry.retractedAt)).toEqual([null, null]);

    client.failingRetractions.clear();
    const again = await ingest(['notes.md'], options(), deps);
    expect(again).toMatchObject({ posted: 0, skipped: 3 });
    expect(again.files[0]?.replaced?.retracted.map((run) => run.digestRunId)).toEqual([
      'digest-run-2',
      'digest-run-3',
    ]);
    expect(standing(ledger)).toEqual(['digest-run-4', 'digest-run-5', 'digest-run-6']);
  });
});
