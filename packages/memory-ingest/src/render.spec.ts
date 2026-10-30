import type { FileReport, IngestReport } from './core/ingest-report';
import type { DocumentRetraction, RetractReport } from './core/retract';
import { renderIngest, renderRetract, renderStatus } from './render';
import { LOOP_URL, manifestEntry } from './test/fakes';

/** A digest run retracted through the configured loop, with the points it removed and the records kept for another posting. */
const run = (digestRunId: string, removed: number, kept = 0) => ({
  digestRunId,
  removed,
  kept,
  recordedUnder: null,
});

const report = (overrides: Partial<IngestReport> = {}): IngestReport => ({
  dryRun: false,
  force: false,
  files: [
    {
      document: 'notes.md',
      parts: 7,
      chunks: [
        {
          index: 1,
          of: 3,
          chunkHash: 'abcdef0123456789abcdef',
          bytes: 2100,
          parts: 3,
          context: null,
          outcome: 'posted',
          orchestrationRunId: 'orch-1',
          status: 'complete',
          steps: manifestEntry().steps,
          error: null,
        },
        {
          index: 2,
          of: 3,
          chunkHash: 'fedcba9876543210fedcba',
          bytes: 1800,
          parts: 2,
          context: 'Ada > Work',
          outcome: 'failed',
          orchestrationRunId: 'orch-2',
          status: 'failed',
          steps: { digest: null, store: null },
          error: 'the digest threw',
        },
        {
          index: 3,
          of: 3,
          chunkHash: '0123456789abcdef012345',
          bytes: 1500,
          parts: 2,
          context: 'Ada > Skills',
          outcome: 'unstored',
          orchestrationRunId: 'orch-3',
          status: 'unstored',
          steps: {
            digest: {
              status: 'complete',
              reason: 'not-accepted',
              note: null,
              counts: { memories: 2, kept: 0 },
            },
            store: { status: 'skipped', reason: 'upstream-skipped', note: 'digest', counts: {} },
          },
          error: null,
        },
      ],
      replaced: null,
      heldBack: { chunk: 2, outcome: 'failed', earlierRuns: 0 },
      unresolved: 0,
    },
    {
      document: 'empty.pdf',
      parts: 0,
      chunks: [],
      replaced: null,
      heldBack: null,
      unresolved: 0,
    },
  ],
  chunks: 3,
  posted: 1,
  noFacts: 0,
  unstored: 1,
  skipped: 0,
  failed: 1,
  stopped: null,
  halted: null,
  ...overrides,
});

describe('renderIngest', () => {
  it('prints one table per document, why nothing was stored or else the context beside each chunk, and a summary', () => {
    const text = renderIngest(report());
    expect(text).toContain('notes.md · 7 parts · 3 chunks');
    expect(text).toMatch(/1\/3\s+abcdef012345\s+2100\s+3\s+posted\s+orch-1\s+—/);
    expect(text).toMatch(/2\/3\s+fedcba987654\s+1800\s+2\s+failed\s+orch-2\s+the digest threw/);
    expect(text).toMatch(
      /3\/3\s+0123456789ab\s+1500\s+2\s+unstored\s+orch-3\s+digest complete: not-accepted/,
    );
    expect(text).toContain(
      'empty.pdf · 0 parts · 0 chunks\n(no text was read — nothing to ingest)',
    );
    expect(text).toContain('chunks 3 · posted 1 · unstored 1 · skipped 0 · failed 1');
    expect(text).not.toContain('retracted');
    expect(text).not.toContain('dry run');
    // Held back, with no earlier digest outside the plan to keep: nothing to say.
    expect(text).not.toContain('held back');
    // A chunk with no fact to store is counted apart, as covered.
    expect(renderIngest(report({ noFacts: 2 }))).toContain(
      'chunks 3 · posted 1 · no facts 2 · unstored 1 · skipped 0 · failed 1',
    );
  });

  it('says so when nothing was posted, and where a refusal stopped the run', () => {
    expect(renderIngest(report({ dryRun: true }))).toContain(
      'dry run — nothing was posted and nothing was recorded',
    );
    expect(
      renderIngest(
        report({ stopped: { document: 'notes.md', chunk: 2, message: '400: no index' } }),
      ),
    ).toContain('stopped at notes.md chunk 2: 400: no index');
  });

  it('[ING-3] says what re-running a halted run does — and for a forced one, both ways on: without --force the chunks it did not reach keep their earlier digests, with it each document is posted whole again', () => {
    const halted = { reason: 'limit' as const, after: 1 };
    expect(renderIngest(report({ halted }))).toContain(
      'halted after 1 chunk(s): limit — re-running the same command posts what is not covered yet',
    );
    expect(renderIngest(report({ halted }))).not.toContain('--force');
    expect(renderIngest(report({ halted, force: true }))).toContain(
      'halted after 1 chunk(s): limit — re-running without --force posts what is not covered yet, so the chunks this run did not reach keep their earlier digests; re-running with --force posts each document whole again',
    );
  });

  it('[ING-3] says why a replacement was held back — the chunk, and the earlier digest runs outside the plan that still stand — and what no digest run is known for', () => {
    const base = report();
    const [notes, empty] = base.files as [FileReport, FileReport];
    const text = renderIngest({
      ...base,
      files: [
        { ...notes, heldBack: { chunk: 2, outcome: 'failed', earlierRuns: 3 }, unresolved: 1 },
        empty,
      ],
    });
    expect(text).toContain(
      'replacement held back at chunk 2 (failed): 3 earlier digest runs outside the current plan still stand',
    );
    expect(text).toContain(
      'unresolved: 1 entry with a run whose report was never read — status --refresh reads it back from its service; then ingest again',
    );
    const one = renderIngest({
      ...base,
      files: [{ ...notes, heldBack: { chunk: 3, outcome: 'pending', earlierRuns: 1 } }, empty],
    });
    expect(one).toContain(
      'replacement held back at chunk 3 (pending): 1 earlier digest run outside the current plan still stands',
    );
  });

  it('[ING-3] prints what replacing a document retracted — points per run, the runs that held nothing apart, and what was left standing — and totals it in the summary', () => {
    const base = report();
    const [notes, empty] = base.files as [FileReport, FileReport];
    const text = renderIngest({
      ...base,
      files: [
        {
          ...notes,
          replaced: {
            through: LOOP_URL,
            retracted: [run('run-1', 4), run('run-2', 0), run('run-3', 2)],
            left: { digestRunIds: ['run-4'], error: '503: the store is unavailable' },
          },
          heldBack: null,
        },
        empty,
      ],
    });
    expect(text).toContain('replaced 3 digest runs (6 memories)');
    expect(text).toMatch(/digest run\s+memories\n-+\s+-+\nrun-1\s+4\nrun-3\s+2/);
    expect(text).toContain('held nothing (1): run-2');
    expect(text).toContain('left standing (1): run-4 — 503: the store is unavailable');
    expect(text).toContain(
      'chunks 3 · posted 1 · unstored 1 · skipped 0 · failed 1 · retracted 3 digest runs (6 memories)',
    );
  });
});

describe('renderRetract', () => {
  const retired: RetractReport = {
    dryRun: false,
    documents: [
      {
        document: 'Resume.pdf',
        entries: 4,
        already: ['run-0'],
        runs: ['run-1', 'run-2', 'run-3'],
        retraction: {
          through: LOOP_URL,
          retracted: [run('run-1', 8), run('run-2', 0), run('run-3', 1)],
          left: null,
        },
        unresolved: 1,
      },
    ],
  };

  it('[ING-3] prints the points each run removed, the runs that removed none apart, what was retracted before, and what the record cannot say', () => {
    const text = renderRetract(retired);
    expect(text).toContain('Resume.pdf · 4 entries');
    expect(text).toMatch(/digest run\s+memories\n-+\s+-+\nrun-1\s+8\nrun-3\s+1/);
    expect(text).toContain('held nothing (1): run-2');
    expect(text).toContain('already retracted (1): run-0');
    expect(text).toContain('unresolved: 1 entry with a run whose report was never read');
    expect(text).toContain('retracted 3 digest runs (9 memories)');
    // A record another standing posting lists too stays current, and the report says so by run.
    const [document] = retired.documents as [DocumentRetraction];
    const shared = renderRetract({
      dryRun: false,
      documents: [
        {
          ...document,
          retraction: {
            through: LOOP_URL,
            retracted: [run('run-1', 2, 1), run('run-2', 0, 2)],
            left: null,
          },
        },
      ],
    });
    expect(shared).toContain(
      'kept current, listed by a standing posting too (2): run-1 (1 record), run-2 (2 records)',
    );
  });

  it('[ING-3] lists the runs recorded under another service apart, with what each removed through the configured one, never among the runs that held nothing', () => {
    const [document] = retired.documents as [DocumentRetraction];
    const other = 'http://localhost:3013';
    const text = renderRetract({
      dryRun: false,
      documents: [
        {
          ...document,
          retraction: {
            through: LOOP_URL,
            retracted: [
              run('run-1', 8),
              { digestRunId: 'run-5', removed: 0, kept: 0, recordedUnder: other },
              { digestRunId: 'run-6', removed: 2, kept: 0, recordedUnder: other },
            ],
            left: null,
          },
        },
      ],
    });
    expect(text).toContain(
      `recorded under ${other}, retracted through ${LOOP_URL} (2): run-5 (0 memories), run-6 (2 memories)`,
    );
    expect(text).not.toContain('held nothing');
    expect(text).toContain('retracted 3 digest runs (10 memories)');
  });

  it('lists what a dry run would retract and says nothing was', () => {
    const [document] = retired.documents as [DocumentRetraction];
    const text = renderRetract({
      dryRun: true,
      documents: [{ ...document, retraction: null, unresolved: 0 }],
    });
    expect(text).toContain('would retract (3): run-1, run-2, run-3');
    expect(text).toContain('dry run — nothing was retracted and nothing was recorded');
    expect(text).not.toContain('unresolved');
  });
});

describe('renderStatus', () => {
  const entry = manifestEntry({
    chunk: { index: 1, of: 2 },
    digestRunId: 'd-1',
    status: 'unstored',
    steps: {
      digest: { status: 'complete', reason: null, note: null, counts: { memories: 3, kept: 2 } },
      store: {
        status: 'skipped',
        reason: 'store-unavailable',
        note: 'qdrant refused the connection',
        counts: {},
      },
    },
  });

  it('[ING-4] prints each entry with the sink it went through and its steps summarized — reason and note — and the refresh counts when there was one', () => {
    const text = renderStatus([entry], {
      entries: [entry],
      refreshed: 1,
      running: 2,
      missing: 3,
      elsewhere: 4,
    });
    expect(text).toMatch(
      /notes\.md\s+1\/2\s+notes\s+loop\s+unstored\s+complete \(memories 3, kept 2\)\s+skipped: store-unavailable — qdrant refused the connection\s+2026-10-02T12:00:00\.000Z\s+orch-1/,
    );
    expect(text).toContain(
      'refreshed 1 · still running 2 · no longer at the service 3 · through another sink 4',
    );
    expect(renderStatus([])).toBe('(the manifest is empty — nothing has been ingested)');
  });

  it('[ING-3] says beside its status when what an entry stored was retracted, and how many points went', () => {
    const text = renderStatus([
      manifestEntry({ retractedAt: '2026-10-14T08:00:00.000Z', retractedPoints: 4 }),
    ]);
    expect(text).toMatch(/document\s+chunk\s+kind\s+sink\s+status\s+retracted\s+digest/);
    expect(text).toMatch(
      /notes\.md\s+1\/1\s+notes\s+loop\s+complete\s+2026-10-14T08:00:00\.000Z \(4 memories\)\s+complete/,
    );
  });
});
