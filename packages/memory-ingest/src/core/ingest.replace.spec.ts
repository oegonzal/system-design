import { LoopRefused } from '@sysdesign/loop-client';

import { FIXED_NOW, scriptedReader, type InMemoryLedger } from '../test/fakes';
import { bullet, harness, NOTES, options, outcomes } from '../test/ingest-harness';
import { ingest, latestByHash } from './ingest';
import type { IngestSink } from './ports';
import { stored } from './record';

/** The notes with the second bullet rewritten to the same length: one chunk changes, two stay. */
const EDITED = ['alpha', 'gamma', 'delta'].map(bullet).join('\n');

/** The digest runs whose facts the saved ledger holds as standing, in the order recorded. */
const standing = (ledger: InMemoryLedger): (string | null)[] =>
  ledger.entries.filter(stored).map((entry) => entry.digestRunId);

/** The sink, with every call it is asked to make written down in the order it is asked. */
const recording = (sink: IngestSink, calls: string[]): IngestSink => ({
  post: (planned) => {
    calls.push('post');
    return sink.post(planned);
  },
  status: (orchestrationRunId) => sink.status(orchestrationRunId),
  retract: (digestRunId) => {
    calls.push(`retract ${digestRunId}`);
    return sink.retract(digestRunId);
  },
});

/**
 * Make before break: once every chunk of a document's current plan is stored,
 * the document's other digests are retracted and marked; until then, nothing
 * of it goes.
 */
describe('ingest, replacing a document', () => {
  it('[ING-1] [ING-3] a re-run skips what the manifest holds as stored, and --force posts the whole document again before it retracts the earlier digests, marking and saving each', async () => {
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
    expect(skipped.files[0]?.replaced).toEqual({ retracted: [], left: null });
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
      retracted: [
        { digestRunId: 'digest-run-1', removed: 3 },
        { digestRunId: 'digest-run-2', removed: 3 },
        { digestRunId: 'digest-run-3', removed: 3 },
      ],
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
    expect(latestByHash(ledger.entries).size).toBe(3);
  });

  it('[ING-3] an edited document posts the chunks the edit changed and, once every chunk is stored, retracts only the digests they replaced', async () => {
    const { deps, posted, loop, ledger } = harness();
    await ingest(['notes.md'], options(), deps);

    deps.reader = scriptedReader({ 'notes.md': EDITED });
    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({ posted: 1, skipped: 2, failed: 0 });
    expect(outcomes(report)).toEqual(['skipped', 'posted', 'skipped']);
    expect(posted).toHaveLength(4);
    expect(loop.retracted).toEqual(['digest-run-2']);
    expect(report.files[0]?.replaced).toEqual({
      retracted: [{ digestRunId: 'digest-run-2', removed: 3 }],
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
    expect(dry.files[0]?.replaced).toBeNull();
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

  it('[ING-3] a document the run did not store whole keeps everything it had — halted, failed or refused — and the run that stores it whole replaces the rest', async () => {
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
    for (const report of [halted, failed, refused]) expect(report.files[0]?.replaced).toBeNull();
    expect(loop.retracted).toEqual([]);
    expect(standing(ledger)).toEqual([...before, 'digest-run-4', 'digest-run-5']);

    const whole = await ingest(['notes.md'], renamed, deps);
    expect(outcomes(whole)).toEqual(['skipped', 'posted', 'skipped']);
    expect(loop.retracted).toEqual(before);
    expect(standing(ledger)).toEqual(['digest-run-4', 'digest-run-5', 'digest-run-6']);
  });

  it('[ING-3] --force --limit 1, then the same command without --force, leaves each chunk stored once: the halted forced run retracts nothing, and the plain run replaces only the chunk it posted again', async () => {
    const { deps, posted, loop, client, ledger } = harness();
    await ingest(['notes.md'], options(), deps);

    const forced = await ingest(['notes.md'], options({ force: true, limit: 1 }), deps);
    expect(forced).toMatchObject({ force: true, posted: 1, halted: { reason: 'limit', after: 1 } });
    expect(forced.files[0]?.replaced).toBeNull();
    expect(loop.retracted).toEqual([]);

    const plain = await ingest(['notes.md'], options(), deps);
    expect(plain).toMatchObject({ posted: 0, skipped: 3, halted: null });
    expect(posted).toHaveLength(4);
    expect(loop.retracted).toEqual(['digest-run-1']);
    expect(standing(ledger)).toEqual(['digest-run-2', 'digest-run-3', 'digest-run-4']);
    // The store holds each chunk's facts once: three digest runs of three points.
    expect([...client.points.values()]).toEqual([3, 3, 3]);
  });

  it('[ING-3] a replacement the loop does not carry out leaves the rest standing and says why, every retraction before it marked and saved, and the next run that stores the document whole retracts the rest', async () => {
    const { deps, client, ledger } = harness();
    await ingest(['notes.md'], options(), deps);
    client.failingRetractions.set('digest-run-2', new LoopRefused(503, 'the store is unavailable'));

    const forced = await ingest(['notes.md'], options({ force: true }), deps);
    expect(forced.files[0]?.replaced).toEqual({
      retracted: [{ digestRunId: 'digest-run-1', removed: 3 }],
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
