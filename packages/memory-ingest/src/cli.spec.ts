import { tableReader } from './adapters/readers/reader-table';
import { execute } from './cli';
import { INGEST_ENV } from './config';
import { SinkFault } from './core/ports';
import { cliDeps as deps, ingestConfig, io, parsed } from './test/cli-harness';
import {
  InMemoryLedger,
  manifestEntry,
  MEMORY_URL,
  sampleExperience,
  ScriptedSink,
  ScriptedStudio,
  settledOutcome,
  SPACE_ID,
} from './test/fakes';

const skipped = {
  status: 'skipped' as const,
  reason: 'upstream-skipped',
  note: 'digest',
  counts: {},
};

/** Ingest, status and the studio export over the ports. `retract` and the lock are `cli.retract.spec.ts`; argv is `cli.parse.spec.ts`. */
describe('execute', () => {
  it('[ING-1] a dry run prints the chunks and posts nothing, exiting 0', async () => {
    const { out, sink } = io();
    const d = deps();
    expect(
      await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada', '--dry-run']), d, sink),
    ).toBe(0);
    expect(out[0]).toContain('notes.md · 4 parts · 1 chunk');
    expect(out[0]).toMatch(/1\/1\s+[0-9a-f]{12}\s+\d+\s+4\s+pending/);
    expect(out[0]).toContain('dry run — nothing was posted and nothing was recorded');
    expect(d.scripted.posted).toHaveLength(0);
    expect(d.ledger.saves).toBe(0);
  });

  it('posts, renders the report or prints it as JSON, and exits 0 when every chunk completed', async () => {
    const { out, sink } = io();
    const d = deps();
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), d, sink)).toBe(0);
    expect(out[0]).toMatch(/posted\s+orch-1/);
    expect(out[0]).toContain('chunks 1 · posted 1 · unstored 0 · skipped 0 · failed 0');
    expect(d.scripted.posted).toHaveLength(1);

    const json = io();
    expect(
      await execute(
        parsed(['ingest', 'notes.md', '--subject', 'Ada', '--json', '--force']),
        d,
        json.sink,
      ),
    ).toBe(0);
    expect(JSON.parse(json.out[0] ?? '')).toMatchObject({ chunks: 1, posted: 1, dryRun: false });
  });

  it('takes the subject from the environment when the flag is absent, and refuses when neither names one', async () => {
    const { errors, sink } = io();
    expect(await execute(parsed(['ingest', 'notes.md', '--dry-run']), deps(), sink)).toBe(2);
    expect(errors[0]).toContain(INGEST_ENV.subject.name);

    const named = deps({ config: ingestConfig({ subject: 'Ada' }) });
    expect(await execute(parsed(['ingest', 'notes.md', '--dry-run']), named, io().sink)).toBe(0);
  });

  it('exits 2 before posting anything when a document cannot be read: an extension no reader takes, a missing file', async () => {
    const { errors, sink } = io();
    const d = deps({ reader: tableReader() });
    expect(await execute(parsed(['ingest', 'notes.docx', '--subject', 'Ada']), d, sink)).toBe(2);
    expect(errors[0]).toContain('no reader for ".docx"');
    expect(d.scripted.posted).toHaveLength(0);

    const missing = io();
    expect(
      await execute(parsed(['ingest', 'gone.md', '--subject', 'Ada']), deps(), missing.sink),
    ).toBe(2);
    expect(missing.errors[0]).toContain('ENOENT');
  });

  it('[ING-4] exits 2 before posting anything when the store cannot serve the run — a space that does not take the configured registers — naming the sink setting, and holds a chunk’s parts to the configured store’s digest', async () => {
    const config = ingestConfig({
      sink: { kind: 'space', tenant: 'north', space: 'notes-space', registers: ['facts'] },
    });
    const refused = deps({
      config,
      sink: () => Promise.reject(new Error('memory space notes-space does not serve the command')),
    });
    const { errors, sink } = io();
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), refused, sink)).toBe(
      2,
    );
    expect(errors[0]).toBe(
      `${INGEST_ENV.sink.name}=space: memory space notes-space does not serve the command`,
    );
    expect(refused.ledger.saves).toBe(0);

    const wide = deps({ config });
    const parts = io();
    expect(
      await execute(
        parsed(['ingest', 'notes.md', '--subject', 'Ada', '--parts-per-chunk', '17']),
        wide,
        parts.sink,
      ),
    ).toBe(2);
    expect(parts.errors[0]).toBe(
      `--parts-per-chunk must be at most 16 when ${INGEST_ENV.sink.name} is space, got 17`,
    );
    expect(wide.scripted.posted).toHaveLength(0);
    // The loop's digest takes more: the same flag is fine there.
    expect(
      await execute(
        parsed(['ingest', 'notes.md', '--subject', 'Ada', '--parts-per-chunk', '17', '--dry-run']),
        deps(),
        io().sink,
      ),
    ).toBe(0);
  });

  it('exits 1 when a chunk failed, the store refused one, or the digest settled one with nothing stored', async () => {
    const failed = deps({
      sinkAdapter: new ScriptedSink([settledOutcome({ status: 'failed', error: 'digest threw' })]),
    });
    const { out, sink } = io();
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), failed, sink)).toBe(1);
    expect(out[0]).toMatch(/failed\s+orch-1\s+digest threw/);

    const refused = deps({
      sinkAdapter: new ScriptedSink([new SinkFault('refused', '400: no document index')]),
    });
    const second = io();
    expect(
      await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), refused, second.sink),
    ).toBe(1);
    expect(second.out[0]).toContain('stopped at notes.md chunk 1: 400: no document index');

    const unstored = deps({
      sinkAdapter: new ScriptedSink([
        settledOutcome({
          digestRunId: null,
          steps: {
            digest: {
              status: 'skipped',
              reason: 'embeddings-disabled',
              note: 'no provider',
              counts: {},
            },
            store: skipped,
          },
        }),
      ]),
    });
    const third = io();
    expect(
      await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), unstored, third.sink),
    ).toBe(1);
    expect(third.out[0]).toMatch(
      /unstored\s+orch-1\s+digest skipped: embeddings-disabled — no provider/,
    );
    expect(third.out[0]).toContain('chunks 1 · posted 0 · unstored 1 · skipped 0 · failed 0');

    // Settled with no fact to store: the chunk is covered, and nothing is wrong.
    const empty = deps({
      sinkAdapter: new ScriptedSink([
        settledOutcome({
          digestRunId: 'd-1',
          steps: {
            digest: {
              status: 'complete',
              reason: 'no-memories',
              note: null,
              counts: { memories: 0 },
            },
            store: skipped,
          },
        }),
      ]),
    });
    const fourth = io();
    expect(
      await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), empty, fourth.sink),
    ).toBe(0);
    expect(fourth.out[0]).toMatch(/no-facts\s+orch-1\s+digest complete: no-memories/);
    expect(fourth.out[0]).toContain('posted 0 · no facts 1 · unstored 0');
  });

  it('[ING-3] exits 1 and names what was left standing when replacing a document hit a retraction the store did not carry out', async () => {
    // An earlier digest of the document, from text it no longer has.
    const ledger = new InMemoryLedger([
      manifestEntry({ chunkHash: 'earlier', digestRunId: 'run-earlier' }),
    ]);
    const d = deps({ ledger });
    d.scripted.failingRetractions.set(
      'run-earlier',
      new SinkFault('refused', '503: the store is unavailable'),
    );
    const { out, sink } = io();
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), d, sink)).toBe(1);
    expect(out[0]).toMatch(/posted\s+orch-1/);
    expect(out[0]).toContain('left standing (1): run-earlier — 503: the store is unavailable');
    expect(ledger.entries[0]?.retractedAt).toBeNull();
  });

  it('status prints the manifest, and --refresh rewrites what the store has settled — the other sink’s postings listed and kept', async () => {
    const empty = io();
    expect(await execute(parsed(['status']), deps(), empty.sink)).toBe(0);
    expect(empty.out[0]).toContain('the manifest is empty');

    // A wait lost after the start: the loop has settled it since. A space posting beside it is another store's.
    const ledger = new InMemoryLedger([
      manifestEntry({
        chunkHash: 'abc',
        digestRunId: null,
        status: 'failed',
        steps: { digest: null, store: null },
        error: 'lost',
      }),
      manifestEntry({
        chunkHash: 'space-1',
        sink: 'space',
        host: MEMORY_URL,
        spaceId: SPACE_ID,
        scope: { tenant: 'north' },
        orchestrationRunId: 'digest-1',
        digestRunId: 'register-digest-1',
        recordIds: ['r-1'],
      }),
    ]);
    const d = deps({ ledger });
    d.scripted.records.set(
      'orch-1',
      settledOutcome({
        digestRunId: 'd-1',
        steps: {
          digest: { status: 'complete', reason: null, note: null, counts: { memories: 2 } },
          store: { status: 'complete', reason: null, note: null, counts: { chunks: 2 } },
        },
      }),
    );
    const { out, sink } = io();
    expect(await execute(parsed(['status', '--refresh']), d, sink)).toBe(0);
    expect(out[0]).toMatch(
      /notes\.md\s+1\/1\s+notes\s+loop\s+complete\s+complete \(memories 2\)\s+complete \(chunks 2\)/,
    );
    expect(out[0]).toMatch(/notes\.md\s+1\/1\s+notes\s+space\s+complete/);
    expect(out[0]).toContain(
      'refreshed 1 · still running 0 · no longer at the service 0 · through another sink 1',
    );
    expect(ledger.entries[0]).toMatchObject({
      status: 'complete',
      digestRunId: 'd-1',
      error: null,
    });
    expect(ledger.entries[1]).toMatchObject({ sink: 'space', recordIds: ['r-1'] });

    const json = io();
    expect(await execute(parsed(['status', '--json']), d, json.sink)).toBe(0);
    expect(JSON.parse(json.out[0] ?? '')).toMatchObject({
      entries: [{ chunkHash: 'abc', status: 'complete' }, { chunkHash: 'space-1' }],
      refresh: null,
    });
  });

  it('[ING-3] export-studio writes the studio’s record as documents under the folder, relative to the working directory, and exits 2 writing nothing when the studio cannot be read', async () => {
    const { out, sink } = io();
    const d = deps();
    expect(
      await execute(parsed(['export-studio', '--out', 'docs/ingestion/studio']), d, sink),
    ).toBe(0);
    expect([...d.writer.written.keys()]).toEqual([
      '/work/docs/ingestion/studio/studio-experiences.md',
      '/work/docs/ingestion/studio/studio-star-stories.md',
    ]);
    expect(d.writer.written.get('/work/docs/ingestion/studio/studio-star-stories.md')).toContain(
      '# The settlement backlog\n\n## Situation',
    );
    expect(out).toEqual([
      '/work/docs/ingestion/studio/studio-experiences.md: 1 record\n/work/docs/ingestion/studio/studio-star-stories.md: 1 record',
    ]);

    const json = io();
    expect(
      await execute(parsed(['export-studio', '--out', 'studio', '--json']), d, json.sink),
    ).toBe(0);
    expect(JSON.parse(json.out[0] ?? '')).toEqual({
      files: [
        { path: '/work/studio/studio-experiences.md', records: 1, withheld: {}, removed: false },
        { path: '/work/studio/studio-star-stories.md', records: 1, withheld: {}, removed: false },
      ],
    });

    const down = io();
    const unreachable = deps({
      studio: {
        experiences: () => Promise.reject(new Error('fetch failed: ECONNREFUSED studio.test')),
        stories: () => Promise.resolve([]),
      },
    });
    expect(
      await execute(parsed(['export-studio', '--out', 'studio']), unreachable, down.sink),
    ).toBe(2);
    expect(down.errors).toEqual(['fetch failed: ECONNREFUSED studio.test']);
    expect(unreachable.writer.written.size).toBe(0);
  });

  it('[ING-3] export-studio prints what it withheld under each origin and what it removed, and exits 2 leaving an earlier export as it was for an experience of an origin it does not know', async () => {
    const practice = sampleExperience({ origin: 'practice' });
    const { out, sink } = io();
    const d = deps({ studio: new ScriptedStudio([sampleExperience(), practice], []) });
    expect(await execute(parsed(['export-studio', '--out', 'studio']), d, sink)).toBe(0);
    expect(out).toEqual([
      '/work/studio/studio-experiences.md: 1 record · 1 withheld as practice\n/work/studio/studio-star-stories.md: no records — nothing written',
    ]);

    const practiceOnly = io();
    const stale = deps({ studio: new ScriptedStudio([practice], []) });
    stale.writer.written.set('/work/studio/studio-experiences.md', '# An earlier export\n');
    expect(
      await execute(parsed(['export-studio', '--out', 'studio']), stale, practiceOnly.sink),
    ).toBe(0);
    expect(practiceOnly.out[0]).toContain(
      '/work/studio/studio-experiences.md: no records — nothing written · 1 withheld as practice · the earlier document removed',
    );
    expect(stale.writer.written.size).toBe(0);

    const unknown = io();
    const undeclared = { id: '44444444-4444-4444-8444-444444444444', origin: undefined };
    const older = deps({
      studio: new ScriptedStudio([sampleExperience(), sampleExperience(undeclared)], []),
    });
    older.writer.written.set('/work/studio/studio-experiences.md', '# An earlier export\n');
    const earlier = new Map(older.writer.written);
    expect(await execute(parsed(['export-studio', '--out', 'studio']), older, unknown.sink)).toBe(
      2,
    );
    expect(unknown.errors[0]).toContain(`experience ${undeclared.id} (no origin)`);
    expect(older.writer.written).toEqual(earlier);
    expect(older.writer.removed).toEqual([]);
  });
});
