import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  filterToc,
  importDump,
  RDS_CA_BUNDLE,
  restoreCommand,
  spawnRunner,
  type ProcessStream,
  type RunProcess,
} from './import-dump';

/** A table of contents as `pg_restore --list` printed one on 2026-11-11 (PostgreSQL 16.10, pgvector 0.8.0). */
const LISTED = [
  ';',
  '; Archive created at 2026-11-11 23:33:58 UTC',
  ';     dbname: sysdesign',
  ';     Format: CUSTOM',
  ';',
  '; Selected TOC Entries:',
  ';',
  '2; 3079 16718 EXTENSION - vector ',
  '3597; 0 0 COMMENT - EXTENSION vector ',
  '3598; 0 0 COMMENT - EXTENSION plpgsql ',
  '216; 1259 17046 TABLE public sample admin',
  '217; 1259 17053 SEQUENCE public sample_seq admin',
  '3589; 0 17046 TABLE DATA public sample admin',
  '3599; 0 0 SEQUENCE SET public sample_seq admin',
  '3445; 2606 17052 CONSTRAINT public sample sample_pkey admin',
];

const DB_ENV = {
  DB_HOST: 'db.internal',
  DB_PORT: '5432',
  DB_USERNAME: 'sysdesign',
  DB_PASSWORD: 'hunter2',
  DB_NAME: 'sysdesign',
};

const dirs: string[] = [];
const workDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'import-dump-spec-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the table of contents filter', () => {
  it('[OPS-4] drops every extension and extension-comment entry, naming each with why, and keeps the rest with the comment lines', () => {
    const { lines, kept, dropped } = filterToc(LISTED);
    expect(dropped).toEqual([
      'EXTENSION - vector (the migrations created the extension; --clean would drop and re-create it)',
      'COMMENT - EXTENSION vector (only the extension’s owner may comment on it, and the master user owns none)',
      'COMMENT - EXTENSION plpgsql (only the extension’s owner may comment on it, and the master user owns none)',
    ]);
    expect(kept).toBe(5);
    expect(lines).toEqual([...LISTED.slice(0, 7), ...LISTED.slice(10)]);
  });

  it('reads a table whose name starts like an extension entry as the table it is', () => {
    const { kept, dropped } = filterToc(['5; 1259 1 TABLE public extension_log admin']);
    expect([kept, dropped]).toEqual([1, []]);
  });
});

describe('the restore command', () => {
  it('[OPS-4] restores the list over the named database as a master user that owns nothing, in one transaction that stops at the first error, the password through libpq, no TLS when none is set', () => {
    const command = restoreCommand(DB_ENV, '/w/restore.list', '/w/cutover.dump');
    expect(command.file).toBe('pg_restore');
    expect(command.args).toEqual([
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      '--no-password',
      '--use-list',
      '/w/restore.list',
      '--dbname',
      'sysdesign',
      '--host',
      'db.internal',
      '--port',
      '5432',
      '--username',
      'sysdesign',
      '/w/cutover.dump',
    ]);
    expect(command.env).toEqual({ ...DB_ENV, PGPASSWORD: 'hunter2' });
  });

  it('[OPS-4] passes the TLS mode and the RDS bundle to libpq when the task sets PGSSLMODE', () => {
    const { env } = restoreCommand(
      { ...DB_ENV, PGSSLMODE: 'verify-full', PATH: '/usr/bin' },
      '/w/restore.list',
      '/w/cutover.dump',
    );
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      PGPASSWORD: 'hunter2',
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: RDS_CA_BUNDLE,
    });
  });

  it('takes the laptop defaults for a connection nothing names', () => {
    expect(restoreCommand({}, 'l', 'a').args.slice(9)).toEqual([
      '--dbname',
      'sysdesign',
      '--host',
      'localhost',
      '--port',
      '5433',
      '--username',
      'admin',
      'a',
    ]);
  });
});

/** A process runner that records every run and answers each from a script, in order. */
function scriptedRunner(
  answers: readonly { lines?: readonly [ProcessStream, string][]; code: number }[],
) {
  const runs: { file: string; args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
  const run: RunProcess = async (file, args, env, onLine) => {
    const answer = answers[runs.length];
    runs.push({ file, args, env });
    if (answer === undefined) throw new Error(`no answer scripted for run ${runs.length}`);
    for (const [stream, line] of answer.lines ?? []) onLine(stream, line);
    return answer.code;
  };
  return { run, runs };
}

describe('the import', () => {
  it('[OPS-4] downloads the key beside the list, lists the archive, writes the filtered list and restores from it, answering pg_restore’s exit code', async () => {
    const dir = workDir();
    const downloads: string[][] = [];
    const log: string[] = [];
    const { run, runs } = scriptedRunner([
      { lines: LISTED.map((line) => ['stdout', line]), code: 0 },
      {
        lines: [
          ['stderr', 'pg_restore: warning: errors ignored on restore: 0'],
          ['stdout', 'done'],
        ],
        code: 0,
      },
    ]);
    const outcome = await importDump({
      bucket: 'artifacts',
      key: 'imports/cutover.dump',
      workDir: dir,
      download: async (bucket, key, to) => void downloads.push([bucket, key, to]),
      run,
      env: { ...DB_ENV, PGSSLMODE: 'verify-full' },
      log: (line) => void log.push(line),
    });

    const archive = join(dir, 'cutover.dump');
    const list = join(dir, 'restore.list');
    expect(downloads).toEqual([['artifacts', 'imports/cutover.dump', archive]]);
    expect(runs.map(({ file, args }) => [file, ...args])).toEqual([
      ['pg_restore', '--list', archive],
      ['pg_restore', ...restoreCommand(DB_ENV, list, archive).args],
    ]);
    expect(runs[1]?.env).toMatchObject({ PGPASSWORD: 'hunter2', PGSSLROOTCERT: RDS_CA_BUNDLE });
    expect(readFileSync(list, 'utf8')).toBe(`${filterToc(LISTED).lines.join('\n')}\n`);
    expect(outcome).toEqual({
      archive,
      kept: 5,
      dropped: filterToc(LISTED).dropped,
      exitCode: 0,
    });
    expect(log).toEqual([
      `downloading s3://artifacts/imports/cutover.dump to ${archive}`,
      ...filterToc(LISTED).dropped.map((entry) => `skipping ${entry}`),
      `pg_restore ${restoreCommand(DB_ENV, list, archive).args.join(' ')}`,
      'pg_restore: warning: errors ignored on restore: 0',
      'done',
      'restored imports/cutover.dump: 5 entries, 3 skipped',
    ]);
  });

  it('answers a failed restore’s exit code, logged, and throws when the archive could not even be listed', async () => {
    const failing = scriptedRunner([
      { lines: LISTED.map((line) => ['stdout', line]), code: 0 },
      { lines: [['stderr', 'pg_restore: error: could not execute query']], code: 1 },
    ]);
    const log: string[] = [];
    const deps = {
      bucket: 'artifacts',
      key: 'imports/cutover.dump',
      workDir: workDir(),
      download: async () => undefined,
      env: DB_ENV,
      log: (line: string) => void log.push(line),
    };
    await expect(importDump({ ...deps, run: failing.run })).resolves.toMatchObject({
      exitCode: 1,
    });
    expect(log.slice(-2)).toEqual([
      'pg_restore: error: could not execute query',
      'pg_restore exited 1',
    ]);

    const unlistable = scriptedRunner([{ lines: [['stderr', 'not an archive']], code: 1 }]);
    await expect(importDump({ ...deps, run: unlistable.run })).rejects.toThrow(
      /pg_restore --list .*cutover\.dump exited 1/,
    );
    expect(unlistable.runs).toHaveLength(1);
  });
});

describe('the spawn runner', () => {
  it('runs a program without a shell, hands each line over by stream, and answers its exit code', async () => {
    const lines: [ProcessStream, string][] = [];
    const code = await spawnRunner(
      process.execPath,
      [
        '-e',
        'console.log("one"); console.error("two"); console.log("three $HOME"); process.exit(3)',
      ],
      { ...process.env },
      (stream, line) => void lines.push([stream, line]),
    );
    expect(code).toBe(3);
    expect(lines.filter(([stream]) => stream === 'stdout')).toEqual([
      ['stdout', 'one'],
      ['stdout', 'three $HOME'],
    ]);
    expect(lines.filter(([stream]) => stream === 'stderr')).toEqual([['stderr', 'two']]);
  });

  it('rejects a program that could not run', async () => {
    await expect(spawnRunner('/no/such/program', [], {}, () => undefined)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
