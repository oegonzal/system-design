import { DOCUMENT_MEMORY_ORCHESTRATOR_ID, DOCUMENT_TITLE_MAX_LENGTH } from '@sysdesign/contracts';
import { LoopRefused } from '@sysdesign/loop-client';

import { INGEST_MAX_ITERATIONS } from '../adapters/loop-http/loop-ingest-sink';
import type { SettleScript } from '../test/fake-ingest-loop';
import { FIXED_NOW } from '../test/fakes';
import { harness, LOOP_URL, options, outcomes } from '../test/ingest-harness';
import { DocumentNameTooLong, ingest, latestByHash, planIngest } from './ingest';

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

/** Posting and recording: each chunk once, in order, every outcome kept. Replacing a document is `ingest.replace.spec.ts`. */
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
