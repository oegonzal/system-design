import type { IngestReport } from './core/ingest';
import type { ManifestEntry } from './core/ports';
import { renderIngest, renderStatus } from './render';
import { FIXED_NOW } from './test/fakes';

const STORED: ManifestEntry['steps'] = {
  digest: { status: 'complete', reason: null, note: null, counts: { memories: 3, kept: 3 } },
  store: { status: 'complete', reason: null, note: null, counts: { chunks: 3, embedded: 3 } },
};

const report = (overrides: Partial<IngestReport> = {}): IngestReport => ({
  dryRun: false,
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
          steps: STORED,
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
    },
    { document: 'empty.pdf', parts: 0, chunks: [] },
  ],
  chunks: 3,
  posted: 1,
  unstored: 1,
  skipped: 0,
  failed: 1,
  stopped: null,
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
    expect(text).not.toContain('dry run');
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
});

describe('renderStatus', () => {
  const entry: ManifestEntry = {
    chunkHash: 'abc',
    document: 'notes.md',
    chunk: { index: 1, of: 2 },
    kind: 'notes',
    orchestrationRunId: 'orch-1',
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
    error: null,
    ingestedAt: FIXED_NOW,
    loopUrl: 'http://loop.test',
  };

  it('prints each entry with its steps summarized — reason and note — and the refresh counts when there was one', () => {
    const text = renderStatus([entry], { entries: [entry], refreshed: 1, running: 2, missing: 3 });
    expect(text).toMatch(
      /notes\.md\s+1\/2\s+notes\s+unstored\s+complete \(memories 3, kept 2\)\s+skipped: store-unavailable — qdrant refused the connection\s+2026-10-02T12:00:00\.000Z\s+orch-1/,
    );
    expect(text).toContain('refreshed 1 · still running 2 · no longer at the loop 3');
    expect(renderStatus([])).toBe('(the manifest is empty — nothing has been ingested)');
  });
});
