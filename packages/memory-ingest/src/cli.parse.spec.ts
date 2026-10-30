import { COMMANDS, parseOptions, USAGE } from './cli';
import { INGEST_FLAGS } from './config';
import { PARTS_PER_CHUNK } from './core/chunk';
import { DEFAULT_CHUNK_BYTES } from './config';
import { parsed } from './test/cli-harness';

/** argv as the command line reads it. What the options do is `cli.spec.ts` and `cli.retract.spec.ts`. */
describe('parseOptions', () => {
  it('reads each manifest command with its flags, defaulting what is not given', () => {
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
        '--scope',
        'subject',
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
      scope: 'subject',
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
      scope: null,
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

  it('[ING-4] reads the space commands: a space and a tenant on each, the keys to narrow by beyond the tenant, a key or a text to recall by, one record id to trace or forget, and a reason to forget it for', () => {
    expect(
      parsed(['recall', '--space', 'notes-space', '--tenant', 'north', '--text', 'which language']),
    ).toEqual({
      command: 'recall',
      space: 'notes-space',
      tenant: 'north',
      under: {},
      key: null,
      text: 'which language',
      register: null,
      json: false,
    });
    expect(
      parsed([
        'recall',
        '--space',
        'notes-space',
        '--tenant',
        'north',
        '--under',
        'project=job-assistant, unit=abc123',
        '--text',
        'notice period',
      ]),
    ).toMatchObject({ under: { project: 'job-assistant', unit: 'abc123' } });
    expect(
      parsed([
        'recall',
        '--space',
        'notes-space',
        '--tenant',
        'north',
        '--key',
        'Ada',
        '--register',
        'semantic_fact',
        '--json',
      ]),
    ).toEqual({
      command: 'recall',
      space: 'notes-space',
      tenant: 'north',
      under: {},
      key: 'Ada',
      text: null,
      register: 'semantic_fact',
      json: true,
    });
    expect(parsed(['history', 'r-1', '--space', 'notes-space', '--tenant', 'north'])).toEqual({
      command: 'history',
      recordId: 'r-1',
      space: 'notes-space',
      tenant: 'north',
      under: {},
      json: false,
    });
    expect(
      parsed([
        'forget',
        'r-1',
        '--space',
        'notes-space',
        '--tenant',
        'north',
        '--reason',
        ' stated of someone else ',
        '--json',
      ]),
    ).toEqual({
      command: 'forget',
      recordId: 'r-1',
      space: 'notes-space',
      tenant: 'north',
      under: {},
      reason: 'stated of someone else',
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
    [['ingest', 'a.md', '--scope', 'everywhere'], '--scope must be one of subject —'],
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
    [['recall', '--tenant', 'north', '--text', 'q'], '--space is required'],
    [['recall', '--space', 's', '--text', 'q'], '--tenant is required'],
    [['recall', '--space', 's', '--tenant', 'north'], '--key or --text is required'],
    [
      ['recall', '--space', 'Not A Space', '--tenant', 'north', '--key', 'k'],
      '--space must name a memory space',
    ],
    [['recall', '--space', 's', '--tenant', 'none', '--key', 'k'], '--tenant must name the tenant'],
    [
      ['recall', '--space', 's', '--tenant', 'north', '--key', 'k', '--under', 'project'],
      '--under takes key=value pairs',
    ],
    [
      ['recall', '--space', 's', '--tenant', 'north', '--key', 'k', '--under', 'a=1,a=2'],
      '--under names a key twice',
    ],
    [
      ['history', 'r-1', '--space', 's', '--tenant', 'north', '--under', '9key=1'],
      '--under is not a scope the host takes',
    ],
    [
      ['recall', '--space', 's', '--tenant', 'north', '--key', 'k', '--register', ' '],
      '--register must name a register',
    ],
    [
      ['recall', '--space', 's', '--tenant', 'north', '--key', 'k', 'r-1'],
      "Unexpected argument 'r-1'",
    ],
    [['history', '--space', 's', '--tenant', 'north'], 'history takes one record id'],
    [['history', 'r-1', 'r-2', '--space', 's', '--tenant', 'north'], 'history takes one record id'],
    [
      ['history', 'r-1', '--space', 's', '--tenant', 'north', '--reason', 'x'],
      "Unknown option '--reason'",
    ],
    [['forget', 'r-1', '--space', 's', '--tenant', 'north'], '--reason is required'],
    [
      ['forget', 'r-1', '--space', 's', '--tenant', 'north', '--reason', 'x'.repeat(376)],
      '--reason must say why',
    ],
  ])('refuses %j', (argv, message) => {
    const result = parseOptions(argv);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain(message);
  });

  it('[ING-1] a file declares only a scope bound to no unit of work: a unit-bound one is refused by name, since a file names no unit', () => {
    const result = parseOptions(['ingest', 'a.md', '--scope', 'unit']);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe(
      '--scope must be one of subject — a file names no unit of work — got unit',
    );
  });

  it('declares every flag a command takes, and no flag no command takes', () => {
    const taken = new Set(Object.values(COMMANDS).flatMap((command) => [...command.flags]));
    expect([...taken].sort()).toEqual(Object.keys(INGEST_FLAGS).sort());
  });

  it('explains every flag in the usage by the meaning it declares, one line each', () => {
    const lines = USAGE.split('\n');
    for (const [name, flag] of Object.entries(INGEST_FLAGS)) {
      const explained = lines.filter(
        (line) => line.startsWith(`  --${name} `) && line.endsWith(`  ${flag.describe}`),
      );
      expect(explained, `--${name}`).toHaveLength(1);
    }
  });
});
