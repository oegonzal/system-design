import { LoopRefused } from '@sysdesign/loop-client';

import { tableReader } from './adapters/readers/reader-table';
import { execute, parseOptions, USAGE, type CliDeps, type Io, type Options } from './cli';
import { DEFAULT_CHUNK_BYTES, INGEST_ENV } from './config';
import type { ManifestEntry } from './core/ports';
import {
  FIXED_NOW,
  fixedClock,
  InMemoryLedger,
  ScriptedSink,
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
      dryRun: false,
      force: false,
      json: false,
    });
    expect(parsed(['status'])).toEqual({ command: 'status', refresh: false, json: false });
    expect(parsed(['status', '--refresh', '--json'])).toEqual({
      command: 'status',
      refresh: true,
      json: true,
    });
  });

  it.each([
    [[], USAGE],
    [['--help'], USAGE],
    [['fly'], USAGE],
    [['ingest'], 'ingest takes at least one document path'],
    [['ingest', 'a.md', '--kind', 'poems'], '--kind must be one of resume, notes'],
    [['ingest', 'a.md', '--chunk-bytes', 'lots'], '--chunk-bytes must be a positive integer'],
    [
      ['ingest', 'a.md', '--subject', 'x'.repeat(121)],
      '--subject must name the subject in 1 to 120',
    ],
    [['ingest', 'a.md', '--subject', '  '], '--subject must name the subject in 1 to 120'],
    [['ingest', 'a.md', '--refresh'], "Unknown option '--refresh'"],
    [['status', '--force'], "Unknown option '--force'"],
    [['status', 'a.md'], "Unexpected argument 'a.md'"],
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
    const built: CliDeps = {
      config: { loopUrl: 'http://loop.test', home: 'static/memory-ingest', subject: undefined },
      cwd: '/work',
      reader: scriptedReader({ 'notes.md': NOTES }),
      sink: scripted,
      ledger,
      clock: fixedClock(),
      loopUrl: 'http://loop.test',
      ...overrides,
    };
    return { ...built, scripted, memory: ledger };
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
      config: { loopUrl: 'http://loop.test', home: 'static/memory-ingest', subject: 'Ada' },
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

  const entry = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
    chunkHash: 'abc',
    document: 'notes.md',
    chunk: { index: 1, of: 1 },
    kind: 'notes',
    orchestrationRunId: 'orch-1',
    digestRunId: null,
    status: 'failed',
    steps: { digest: null, store: null },
    error: 'lost',
    ingestedAt: FIXED_NOW,
    loopUrl: 'http://loop.test',
    ...overrides,
  });

  it('status prints the manifest, and --refresh rewrites what the loop has settled', async () => {
    const empty = io();
    expect(await execute(parsed(['status']), deps(), empty.sink)).toBe(0);
    expect(empty.out[0]).toContain('the manifest is empty');

    const ledger = new InMemoryLedger([entry()]);
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
});
