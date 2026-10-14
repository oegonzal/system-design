import { LoopRefused } from '@sysdesign/loop-client';

import { tableReader } from './adapters/readers/reader-table';
import { execute, parseOptions, USAGE, type CliDeps, type Io, type Options } from './cli';
import { PARTS_PER_CHUNK } from './core/chunk';
import { DEFAULT_CHUNK_BYTES, INGEST_ENV } from './config';
import {
  FIXED_NOW,
  fixedClock,
  InMemoryLedger,
  InMemoryWriter,
  manifestEntry,
  sampleExperience,
  sampleStory,
  ScriptedSink,
  ScriptedStudio,
  scriptedReader,
  settledOrchestration,
  stepOf,
} from './test/fakes';

const parsed = (argv: string[]): Options => {
  const options = parseOptions(argv);
  if (options instanceof Error) throw options;
  return options;
};

describe('parseOptions', () => {
  it('reads each command with its flags, defaulting what is not given', () => {
    expect(
      parsed([
        'ingest',
        'a.md',
        'b.pdf',
        '--kind',
        'resume',
        '--subject',
        'Ada',
        '--chunk-bytes',
        '4000',
        '--parts-per-chunk',
        '5',
        '--date',
        '2026-10-02',
        '--limit',
        '2',
        '--dry-run',
        '--force',
        '--json',
      ]),
    ).toEqual({
      command: 'ingest',
      paths: ['a.md', 'b.pdf'],
      kind: 'resume',
      subject: 'Ada',
      chunkBytes: 4000,
      partsPerChunk: 5,
      date: '2026-10-02',
      limit: 2,
      dryRun: true,
      force: true,
      json: true,
    });
    expect(parsed(['ingest', 'a.md'])).toEqual({
      command: 'ingest',
      paths: ['a.md'],
      kind: 'notes',
      subject: undefined,
      chunkBytes: DEFAULT_CHUNK_BYTES,
      partsPerChunk: PARTS_PER_CHUNK,
      date: null,
      limit: null,
      dryRun: false,
      force: false,
      json: false,
    });
    expect(parsed(['retract', 'a.md', 'b.pdf', '--dry-run', '--json'])).toEqual({
      command: 'retract',
      paths: ['a.md', 'b.pdf'],
      dryRun: true,
      json: true,
    });
    expect(parsed(['retract', 'a.md'])).toEqual({
      command: 'retract',
      paths: ['a.md'],
      dryRun: false,
      json: false,
    });
    expect(parsed(['status'])).toEqual({ command: 'status', refresh: false, json: false });
    expect(parsed(['status', '--refresh', '--json'])).toEqual({
      command: 'status',
      refresh: true,
      json: true,
    });
    expect(parsed(['export-studio', '--out', 'docs/ingestion/studio', '--json'])).toEqual({
      command: 'export-studio',
      out: 'docs/ingestion/studio',
      json: true,
    });
  });

  it.each([
    [[], USAGE],
    [['--help'], USAGE],
    [['fly'], USAGE],
    [['ingest'], 'ingest takes at least one document path'],
    [['ingest', 'a.md', '--kind', 'poems'], '--kind must be one of resume, notes'],
    [['ingest', 'a.md', '--date', 'last tuesday'], '--date must be a day as YYYY-MM-DD'],
    [['ingest', 'a.md', '--limit', '0'], '--limit must be a positive integer'],
    [['ingest', 'a.md', '--parts-per-chunk', '99'], '--parts-per-chunk must be a positive integer'],
    [['ingest', 'a.md', '--chunk-bytes', 'lots'], '--chunk-bytes must be a positive integer'],
    [
      ['ingest', 'a.md', '--subject', 'x'.repeat(121)],
      '--subject must name the subject in 1 to 120',
    ],
    [['ingest', 'a.md', '--subject', '  '], '--subject must name the subject in 1 to 120'],
    [['ingest', 'a.md', '--refresh'], "Unknown option '--refresh'"],
    [['retract'], 'retract takes at least one document path'],
    [['retract', '--dry-run'], 'retract takes at least one document path'],
    [['retract', 'a.md', '--force'], "Unknown option '--force'"],
    [['retract', 'a.md', '--kind', 'resume'], "Unknown option '--kind'"],
    [['status', '--force'], "Unknown option '--force'"],
    [['status', 'a.md'], "Unexpected argument 'a.md'"],
    [['export-studio'], '--out is required'],
    [['export-studio', '--out', ' '], '--out is required'],
    [['export-studio', '--out', 'd', 'a.md'], "Unexpected argument 'a.md'"],
  ])('refuses %j', (argv, message) => {
    const result = parseOptions(argv);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(message);
  });
});

const NOTES = `# Ada\n\n## Work\n\n- Translated the memoir.\n- Wrote Note G.`;

describe('execute', () => {
  const io = () => {
    const out: string[] = [];
    const errors: string[] = [];
    const sink: Io = { out: (t) => out.push(t), error: (t) => errors.push(t) };
    return { out, errors, sink };
  };
  /** Every port a fake, each reachable by the test that wants to inspect it. */
  const deps = (overrides: Partial<CliDeps> = {}) => {
    const scripted = new ScriptedSink();
    const ledger = new InMemoryLedger();
    const writer = new InMemoryWriter();
    const built: CliDeps = {
      config: {
        loopUrl: 'http://loop.test',
        studioUrl: 'http://studio.test',
        home: 'static/memory-ingest',
        subject: undefined,
      },
      cwd: '/work',
      reader: scriptedReader({ 'notes.md': NOTES }),
      sink: scripted,
      ledger,
      clock: fixedClock(),
      loopUrl: 'http://loop.test',
      studio: new ScriptedStudio([sampleExperience()], [sampleStory()]),
      writer,
      ...overrides,
    };
    return { ...built, scripted, memory: ledger, writer };
  };

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
    expect(d.memory.saves).toBe(0);
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
    expect(errors[0]).toContain(INGEST_ENV.subject);

    const named = deps({
      config: {
        loopUrl: 'http://loop.test',
        studioUrl: 'http://studio.test',
        home: 'static/memory-ingest',
        subject: 'Ada',
      },
    });
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

  it('exits 1 when a chunk failed, the loop refused one, or the loop settled one with nothing stored', async () => {
    const failed = deps({
      sink: new ScriptedSink([
        settledOrchestration({
          status: 'failed',
          error: { name: 'Error', message: 'digest threw', stack: null },
        }),
      ]),
    });
    const { out, sink } = io();
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), failed, sink)).toBe(1);
    expect(out[0]).toMatch(/failed\s+orch-1\s+digest threw/);

    const refused = deps({ sink: new ScriptedSink([new LoopRefused(400, 'no document index')]) });
    const second = io();
    expect(
      await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), refused, second.sink),
    ).toBe(1);
    expect(second.out[0]).toContain('stopped at notes.md chunk 1: 400: no document index');

    const unstored = deps({
      sink: new ScriptedSink([
        settledOrchestration({
          steps: {
            digest: stepOf({
              status: 'skipped',
              reason: 'embeddings-disabled',
              note: 'no provider',
            }),
            store: stepOf({ status: 'skipped', reason: 'upstream-skipped', note: 'digest' }),
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
  });

  it('status prints the manifest, and --refresh rewrites what the loop has settled', async () => {
    const empty = io();
    expect(await execute(parsed(['status']), deps(), empty.sink)).toBe(0);
    expect(empty.out[0]).toContain('the manifest is empty');

    // A wait lost after the start: the loop has settled it since.
    const ledger = new InMemoryLedger([
      manifestEntry({
        chunkHash: 'abc',
        digestRunId: null,
        status: 'failed',
        steps: { digest: null, store: null },
        error: 'lost',
      }),
    ]);
    const d = deps({ ledger });
    d.scripted.records.set(
      'orch-1',
      settledOrchestration({
        steps: {
          digest: stepOf({ runIds: ['d-1'], counts: { memories: 2 } }),
          store: stepOf({ counts: { chunks: 2 } }),
        },
      }),
    );
    const { out, sink } = io();
    expect(await execute(parsed(['status', '--refresh']), d, sink)).toBe(0);
    expect(out[0]).toMatch(
      /notes\.md\s+1\/1\s+notes\s+complete\s+complete \(memories 2\)\s+complete \(chunks 2\)/,
    );
    expect(out[0]).toContain('refreshed 1 · still running 0 · no longer at the loop 0');
    expect(ledger.entries[0]).toMatchObject({
      status: 'complete',
      digestRunId: 'd-1',
      error: null,
    });

    const json = io();
    expect(await execute(parsed(['status', '--json']), d, json.sink)).toBe(0);
    expect(JSON.parse(json.out[0] ?? '')).toMatchObject({
      entries: [{ chunkHash: 'abc', status: 'complete' }],
      refresh: null,
    });
  });

  it('[ING-3] retract retires each document, prints the points each digest run removed with the runs that held nothing apart, and exits 0 — also when everything was retracted already', async () => {
    const ledger = new InMemoryLedger([
      manifestEntry({ chunkHash: 'h1', digestRunId: 'run-1' }),
      manifestEntry({ chunkHash: 'h2', digestRunId: 'run-2', status: 'unstored' }),
    ]);
    const d = deps({ ledger });
    d.scripted.points.set('run-1', 3);
    const { out, sink } = io();
    expect(await execute(parsed(['retract', 'notes.md']), d, sink)).toBe(0);
    expect(out[0]).toContain('notes.md · 2 entries');
    expect(out[0]).toMatch(/run-1\s+3/);
    expect(out[0]).toContain('held nothing (1): run-2');
    expect(out[0]).toContain('retracted 2 digest runs (3 points)');
    expect(d.scripted.retracted).toEqual(['run-1', 'run-2']);
    expect(ledger.entries.map((entry) => [entry.retractedAt, entry.retractedPoints])).toEqual([
      [FIXED_NOW, 3],
      [FIXED_NOW, 0],
    ]);

    const again = io();
    expect(await execute(parsed(['retract', 'notes.md', '--json']), d, again.sink)).toBe(0);
    expect(JSON.parse(again.out[0] ?? '')).toMatchObject({
      dryRun: false,
      documents: [{ document: 'notes.md', already: ['run-1', 'run-2'], runs: [] }],
    });
    expect(d.scripted.retracted).toEqual(['run-1', 'run-2']);
  });

  it('[ING-3] retract exits 2 naming the manifest when it has no entry for a path, retracting nothing, and 1 when a retraction left a digest run standing', async () => {
    const ledger = new InMemoryLedger([manifestEntry({ digestRunId: 'run-1' })]);
    const missing = deps({ ledger });
    const { errors, sink } = io();
    expect(await execute(parsed(['retract', 'notes.md', 'resume.pdf']), missing, sink)).toBe(2);
    expect(errors[0]).toContain(`${ledger.path} has no entry for resume.pdf`);
    expect(missing.scripted.retracted).toEqual([]);

    const failing = deps({ ledger });
    failing.scripted.failingRetractions.set(
      'run-1',
      new LoopRefused(503, 'the store is unavailable'),
    );
    const second = io();
    expect(await execute(parsed(['retract', 'notes.md']), failing, second.sink)).toBe(1);
    expect(second.out[0]).toContain('left standing (1): run-1 — 503: the store is unavailable');
    expect(ledger.entries[0]?.retractedAt).toBeNull();
  });

  it('[ING-3] a command that saves the manifest runs as its one writer: ingest, retract and status --refresh refuse a home another command holds with exit 2, and release it when done, thrown or not; a dry run and a plain status save nothing and take no lock', async () => {
    const ledger = new InMemoryLedger([manifestEntry({ digestRunId: 'run-1' })]);
    const d = deps({ ledger });
    ledger.held = true;
    for (const argv of [
      ['ingest', 'notes.md', '--subject', 'Ada'],
      ['retract', 'notes.md'],
      ['status', '--refresh'],
    ]) {
      const { errors, sink } = io();
      expect(await execute(parsed(argv), d, sink)).toBe(2);
      expect(errors[0]).toContain(ledger.path);
    }
    expect(d.scripted.posted).toHaveLength(0);
    expect(d.scripted.retracted).toEqual([]);
    expect(ledger.saves).toBe(0);
    for (const argv of [
      ['ingest', 'notes.md', '--subject', 'Ada', '--dry-run'],
      ['retract', 'notes.md', '--dry-run'],
      ['status'],
    ]) {
      expect(await execute(parsed(argv), d, io().sink)).toBe(0);
    }

    ledger.held = false;
    expect(await execute(parsed(['ingest', 'notes.md', '--subject', 'Ada']), d, io().sink)).toBe(0);
    expect(ledger.held).toBe(false);
    const down = deps({
      ledger,
      sink: {
        post: () => Promise.reject(new Error('not posted')),
        status: () => Promise.reject(new Error('the quality loop is unreachable: ECONNREFUSED')),
        retract: () => Promise.resolve(0),
      },
    });
    await expect(execute(parsed(['status', '--refresh']), down, io().sink)).rejects.toThrow(
      'unreachable',
    );
    expect(ledger.held).toBe(false);
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
        { path: '/work/studio/studio-experiences.md', records: 1 },
        { path: '/work/studio/studio-star-stories.md', records: 1 },
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
});
