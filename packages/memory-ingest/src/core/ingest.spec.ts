import { DOCUMENT_MEMORY_ORCHESTRATOR_ID, DOCUMENT_TITLE_MAX_LENGTH } from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';

import { INGEST_MAX_ITERATIONS } from '../adapters/loop-http/loop-ingest-sink';
import { fakeIngestLoop, type SettleScript } from '../test/fake-ingest-loop';
import { FIXED_NOW, fixedClock, InMemoryLedger, scriptedReader } from '../test/fakes';
import {
  DocumentNameTooLong,
  ingest,
  latestByHash,
  planIngest,
  type IngestDeps,
  type IngestOptions,
} from './ingest';
import type { IngestSink } from './ports';
import { stored } from './record';

const bullet = (seed: string): string =>
  `- ${Array.from({ length: 160 }, (_, i) => `${seed}${i}`).join(' ')}`;
/**
 * Three bullets of ~1330 chars under a 4000-byte budget: the goal's fixed
 * text weighs ~2150 bytes (the kind line included; 2026-10-13, after the
 * tenure and scope-test rules), so one bullet fits with room and two never do
 * — three chunks, one part each.
 */
const NOTES = ['alpha', 'bravo', 'delta'].map(bullet).join('\n');
/** The notes with the second bullet rewritten to the same length: one chunk changes, two stay. */
const EDITED = ['alpha', 'gamma', 'delta'].map(bullet).join('\n');
const LOOP_URL = 'http://loop.test';

const options = (overrides: Partial<IngestOptions> = {}): IngestOptions => ({
  kind: 'notes',
  subject: 'Ada Lovelace',
  chunkBytes: 4000,
  partsPerChunk: 8,
  date: null,
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
function harness(script: readonly SettleScript[] = []) {
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

const outcomes = (report: Awaited<ReturnType<typeof ingest>>) =>
  report.files.flatMap((file) => file.chunks.map((chunk) => chunk.outcome));

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

/** The three ways the loop settles `complete` with nothing stored, as the orchestrator's steps report them. */
const UNSTORED: SettleScript[] = [
  {
    steps: {
      digest: { status: 'skipped', reason: 'embeddings-disabled', note: 'no embedding provider' },
      store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest' },
    },
  },
  {
    steps: {
      digest: {
        status: 'complete',
        reason: 'not-accepted',
        runIds: ['not-accepted-run'],
        counts: { memories: 4, kept: 0 },
      },
      store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest' },
    },
  },
  {
    steps: {
      digest: { status: 'complete', runIds: ['store-down-run'], counts: { memories: 2, kept: 2 } },
      store: {
        status: 'skipped',
        reason: 'store-unavailable',
        note: 'qdrant refused the connection',
      },
    },
  },
];

describe('ingest', () => {
  it('[ING-1] posts each chunk once, one at a time, awaited to settle, and records every outcome by content hash', async () => {
    const { deps, posted, client, ledger } = harness();
    const report = await ingest(['notes.md'], options(), deps);

    expect(report).toMatchObject({
      chunks: 3,
      posted: 3,
      unstored: 0,
      skipped: 0,
      failed: 0,
      stopped: null,
    });
    expect(posted).toHaveLength(3);
    // Nothing was running when each start arrived: the previous orchestration had settled.
    expect(client.runningAtStart).toEqual([0, 0, 0]);
    const chunks = report.files[0]?.chunks ?? [];
    posted.forEach(({ orchestrator, request }, i) => {
      expect(orchestrator).toBe(DOCUMENT_MEMORY_ORCHESTRATOR_ID);
      expect(request.maxIterations).toBe(INGEST_MAX_ITERATIONS);
      expect(request.goal).toContain(`Chunk ${i + 1} of 3`);
    });

    expect(ledger.saves).toBe(3);
    expect(ledger.entries).toHaveLength(3);
    ledger.entries.forEach((entry, i) => {
      expect(entry).toEqual({
        chunkHash: chunks[i]?.chunkHash,
        document: 'notes.md',
        chunk: { index: i + 1, of: 3 },
        kind: 'notes',
        orchestrationRunId: chunks[i]?.orchestrationRunId,
        digestRunId: `digest-run-${i + 1}`,
        status: 'complete',
        steps: {
          digest: {
            status: 'complete',
            reason: null,
            note: null,
            counts: { memories: 3, kept: 3 },
          },
          store: {
            status: 'complete',
            reason: null,
            note: null,
            counts: { chunks: 3, embedded: 3 },
          },
        },
        error: null,
        ingestedAt: FIXED_NOW,
        loopUrl: LOOP_URL,
        retractedAt: null,
        retractedPoints: null,
      });
    });
    expect(outcomes(report)).toEqual(['posted', 'posted', 'posted']);
    expect(chunks[0]?.steps).toEqual(ledger.entries[0]?.steps);
    // Every chunk stands on its own posting, and nothing else of the document stood to replace.
    expect(report.files[0]?.replaced).toEqual({ retracted: [], left: null });
  });

  it('[ING-1] a limit posts that many chunks and no more, and the chunks it did not reach are posted by re-running the same command', async () => {
    const { deps, posted } = harness();
    const limited = await ingest(['notes.md'], options({ limit: 1 }), deps);
    expect(limited).toMatchObject({ chunks: 3, posted: 1, skipped: 0, failed: 0, stopped: null });
    expect(limited.halted).toEqual({ reason: 'limit', after: 1 });
    expect(outcomes(limited)).toEqual(['posted', 'pending', 'pending']);
    expect(posted).toHaveLength(1);

    // The proven chunk is recorded by its hash, so the full run digests it no second time.
    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({ chunks: 3, posted: 2, skipped: 1, halted: null });
    expect(outcomes(report)).toEqual(['skipped', 'posted', 'posted']);
    expect(posted).toHaveLength(3);

    // A limit met at the run's last chunk leaves nothing pending, so it halts nothing.
    const exact = harness();
    const whole = await ingest(['notes.md'], options({ limit: 3 }), exact.deps);
    expect(whole).toMatchObject({ posted: 3, halted: null });
    expect(whole.files[0]?.replaced).toEqual({ retracted: [], left: null });
  });

  it('[ING-1] an interrupt halts once the chunk in flight is recorded, so no orchestration is left unrecorded', async () => {
    let interrupted = false;
    const { deps, posted, ledger } = harness();
    // The interrupt arrives while the first chunk is in flight.
    const report = await ingest(['notes.md'], options(), {
      ...deps,
      sink: {
        ...deps.sink,
        post: async (planned) => {
          interrupted = true;
          return deps.sink.post(planned);
        },
      },
      interrupted: () => interrupted,
    });
    expect(report.halted).toEqual({ reason: 'interrupted', after: 1 });
    expect(report).toMatchObject({ posted: 1, stopped: null });
    expect(posted).toHaveLength(1);
    // Recorded, not abandoned: the next run skips it rather than storing its facts twice.
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]?.status).toBe('complete');
  });

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

  it('[ING-1] an orchestration the loop settled without storing anything is recorded unstored — never complete — with the step that stopped it, and a re-run posts it again', async () => {
    const { deps, ledger, posted } = harness(UNSTORED);
    const report = await ingest(['notes.md'], options(), deps);

    expect(report).toMatchObject({ chunks: 3, posted: 0, unstored: 3, skipped: 0, failed: 0 });
    expect(outcomes(report)).toEqual(['unstored', 'unstored', 'unstored']);
    expect(posted).toHaveLength(3);
    expect(ledger.entries.map((entry) => entry.status)).toEqual([
      'unstored',
      'unstored',
      'unstored',
    ]);
    // Nothing errored, so `error` stays null; the steps — reason and note kept — carry the why.
    expect(ledger.entries.every((entry) => entry.error === null)).toBe(true);
    expect(ledger.entries[0]?.steps).toEqual({
      digest: {
        status: 'skipped',
        reason: 'embeddings-disabled',
        note: 'no embedding provider',
        counts: {},
      },
      store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest', counts: {} },
    });
    expect(ledger.entries[1]).toMatchObject({
      digestRunId: 'not-accepted-run',
      steps: { digest: { reason: 'not-accepted', counts: { memories: 4, kept: 0 } } },
    });
    expect(ledger.entries[2]?.steps.store).toEqual({
      status: 'skipped',
      reason: 'store-unavailable',
      note: 'qdrant refused the connection',
      counts: {},
    });
    expect(report.files[0]?.replaced).toBeNull();

    // Unstored is not ingested: the next run posts all three again, and this time they land.
    const second = await ingest(['notes.md'], options(), deps);
    expect(second).toMatchObject({ posted: 3, unstored: 0, skipped: 0, failed: 0 });
    expect(posted).toHaveLength(6);
    expect(latestByHash(ledger.entries).size).toBe(3);
    expect([...latestByHash(ledger.entries).values()].every((e) => e.status === 'complete')).toBe(
      true,
    );
  });

  it('[ING-1] a chunk met twice in one run is posted once: the second meeting reads the first posting', async () => {
    const { deps, posted } = harness();
    const report = await ingest(['notes.md', 'notes.md'], options(), deps);
    expect(report).toMatchObject({ chunks: 6, posted: 3, skipped: 3, failed: 0 });
    expect(posted).toHaveLength(3);
    expect(outcomes(report)).toEqual([
      'posted',
      'posted',
      'posted',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(report.files[1]?.chunks[0]?.orchestrationRunId).toBe(
      report.files[0]?.chunks[0]?.orchestrationRunId,
    );
  });

  it('[ING-1] a dry run prints the plan and posts nothing, records nothing', async () => {
    const { deps, posted, ledger } = harness();
    const report = await ingest(['notes.md'], options({ dryRun: true }), deps);
    expect(report).toMatchObject({ dryRun: true, chunks: 3, posted: 0, skipped: 0, failed: 0 });
    expect(outcomes(report)).toEqual(['pending', 'pending', 'pending']);
    expect(report.files[0]?.replaced).toBeNull();
    expect(posted).toHaveLength(0);
    expect(ledger.saves).toBe(0);
  });

  it('a refusal from the loop is recorded and stops the run; the chunks after it stay pending', async () => {
    const { deps, client, ledger, posted } = harness();
    client.refuseNextStart = new LoopRefused(400, 'the goal carries no document index');
    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({
      posted: 0,
      failed: 1,
      stopped: {
        document: 'notes.md',
        chunk: 1,
        message: '400: the goal carries no document index',
      },
    });
    expect(outcomes(report)).toEqual(['refused', 'pending', 'pending']);
    expect(posted).toHaveLength(0);
    expect(ledger.entries).toEqual([
      expect.objectContaining({
        status: 'refused',
        orchestrationRunId: null,
        digestRunId: null,
        error: '400: the goal carries no document index',
      }),
    ]);
  });

  it('a failed or lost orchestration is recorded with its id and the run goes on; a re-run tries it again', async () => {
    const { deps, ledger } = harness([{ fail: 'the digest threw' }, { lose: true }]);
    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({ posted: 1, failed: 2, stopped: null });
    expect(outcomes(report)).toEqual(['failed', 'failed', 'posted']);
    expect(ledger.entries[0]).toMatchObject({
      status: 'failed',
      orchestrationRunId: expect.stringContaining('orchestration'),
      error: 'the digest threw',
    });
    expect(ledger.entries[1]).toMatchObject({
      status: 'failed',
      orchestrationRunId: expect.stringContaining('orchestration'),
      error: expect.stringContaining('no longer has'),
    });

    const second = await ingest(['notes.md'], options(), deps);
    expect(second).toMatchObject({ posted: 2, skipped: 1, failed: 0 });
  });

  it('a start still unreachable once the client has ridden out its recovery window stops the run as a refusal does, the chunks after it pending', async () => {
    const { deps, loop, ledger } = harness();
    loop.unreachable = true;
    const report = await ingest(['notes.md'], options(), deps);
    expect(report).toMatchObject({
      posted: 0,
      failed: 1,
      stopped: { document: 'notes.md', chunk: 1, message: expect.stringContaining('unreachable') },
    });
    expect(outcomes(report)).toEqual(['failed', 'pending', 'pending']);
    expect(ledger.entries).toEqual([
      expect.objectContaining({ status: 'failed', orchestrationRunId: null }),
    ]);
  });

  it('plans every document before posting anything, so an unreadable path or an overlong file name refuses the run up front', async () => {
    const { deps, posted } = harness();
    await expect(planIngest(['notes.md', 'missing.md'], options(), deps)).rejects.toThrow(/ENOENT/);
    const long = `${'n'.repeat(DOCUMENT_TITLE_MAX_LENGTH)}.md`;
    await expect(planIngest([long], options(), deps)).rejects.toBeInstanceOf(DocumentNameTooLong);
    await expect(planIngest([long], options(), deps)).rejects.toThrow(
      `a document title may be at most ${DOCUMENT_TITLE_MAX_LENGTH}`,
    );
    expect(posted).toHaveLength(0);

    const planned = await planIngest(['notes.md'], options(), deps);
    expect(planned).toEqual([
      expect.objectContaining({
        document: 'notes.md',
        plan: expect.objectContaining({ parts: 3 }),
      }),
    ]);
    expect(planned[0]?.plan.chunks.map((chunk) => chunk.chunk.parts.length)).toEqual([1, 1, 1]);
  });
});
