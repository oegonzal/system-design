import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';

import { connectionSettings } from './connection';

/**
 * The data cutover's cloud side: a `pg_dump -Fc` archive of the laptop's
 * database, fetched from the artifacts bucket and restored over the migrated
 * cloud database. `aws.sh db-import` runs it as the migrate task with a
 * command override (docs/aws/deployment.md).
 *
 * An archive made on the laptop carries two kinds of entry the restore must
 * skip. `COMMENT ON EXTENSION` only an extension's owner may run, and on
 * Aurora the master user does not own what the engine installed. The
 * `EXTENSION` entry itself becomes, under `--clean`, a `DROP EXTENSION` once
 * every dependent object is dropped and a `CREATE EXTENSION` after (measured
 * 2026-11-11 on PostgreSQL 16.10: `pg_restore --clean` drops in reverse order,
 * so the drop succeeds) — a round trip the migrations' extension never needs
 * to take, and one that rests on the master user being allowed to create it.
 * `pg_restore` takes a list of the entries to restore, so the archive's table
 * of contents is listed, filtered and handed back to it.
 *
 * The restore is one transaction (`--single-transaction`). Under `--clean`
 * every DROP runs before the first CREATE, and each statement is otherwise
 * its own; a restore that stops at an error — a table the cloud's schema
 * lacks, a network blip — would leave the cloud's tables dropped and the
 * laptop's partly created, with the app then serving from that and a later
 * migration run finding half a schema. In one transaction a failure rolls
 * everything back, so the database is as it was. `--exit-on-error` is what
 * `--single-transaction` implies, kept written out so the restore still
 * stops at the first error should the transaction flag ever go. Everything
 * that touches the world — the download, the two `pg_restore` runs, the log
 * — is injected, so the filter and the command line are proven on their
 * own.
 */

/** Where the images keep Amazon's RDS certificate bundle, for libpq's `verify-full`. */
export const RDS_CA_BUNDLE = '/etc/ssl/certs/rds-global-bundle.pem';

/** One entry of `pg_restore --list`: `<id>; <catalog oid> <object oid> <description>`; a line starting with `;` is a comment. */
const TOC_ENTRY = /^\d+; \d+ \d+ (.+)$/;

/** The descriptions of the entries the restore skips, by the start of the description, and why. */
const REFUSED_ENTRIES: readonly { readonly starts: string; readonly why: string }[] = [
  {
    starts: 'COMMENT - EXTENSION ',
    why: 'only the extension’s owner may comment on it, and the master user owns none',
  },
  {
    starts: 'EXTENSION - ',
    why: 'the migrations created the extension; --clean would drop and re-create it',
  },
];

export interface FilteredToc {
  /** The list as `pg_restore --use-list` takes it: every line but the refused entries. */
  lines: string[];
  /** How many entries are left to restore. */
  kept: number;
  /** Each refused entry, with why. */
  dropped: string[];
}

/** The table of contents minus the entries Aurora refuses; comment lines pass through. */
export function filterToc(listed: readonly string[]): FilteredToc {
  const lines: string[] = [];
  const dropped: string[] = [];
  let kept = 0;
  for (const line of listed) {
    const description = TOC_ENTRY.exec(line)?.[1];
    if (description === undefined) {
      lines.push(line);
      continue;
    }
    const refused = REFUSED_ENTRIES.find(({ starts }) => description.startsWith(starts));
    if (refused === undefined) {
      lines.push(line);
      kept += 1;
    } else {
      dropped.push(`${description.trim()} (${refused.why})`);
    }
  }
  return { lines, kept, dropped };
}

export interface RestoreCommand {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * The restore as one process: the flags for a master user that owns nothing
 * and a database that already has the schema (`--clean --if-exists` drops
 * each object before creating it), one transaction that stops at the first
 * error, the list, the connection from the `DB_*` variables, and the
 * archive. The password and the TLS settings travel as
 * libpq's own variables, never as arguments: `PGSSLROOTCERT` is added when
 * `PGSSLMODE` is set, because `NODE_EXTRA_CA_CERTS` is node's and libpq
 * would otherwise verify the managed database against no bundle.
 */
export function restoreCommand(
  env: NodeJS.ProcessEnv,
  list: string,
  archive: string,
): RestoreCommand {
  const { host, port, user, password, dbName } = connectionSettings(env);
  const sslmode = env['PGSSLMODE'];
  return {
    file: 'pg_restore',
    args: [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      '--no-password',
      '--use-list',
      list,
      '--dbname',
      dbName,
      '--host',
      host,
      '--port',
      String(port),
      '--username',
      user,
      archive,
    ],
    env: {
      ...env,
      PGPASSWORD: password,
      ...(sslmode === undefined ? {} : { PGSSLMODE: sslmode, PGSSLROOTCERT: RDS_CA_BUNDLE }),
    },
  };
}

export type ProcessStream = 'stdout' | 'stderr';

/**
 * Runs a program without a shell, handing each line of its output over as it
 * comes; resolves with the exit code, rejects when the program could not run
 * at all or was killed by a signal.
 */
export type RunProcess = (
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  onLine: (stream: ProcessStream, line: string) => void,
) => Promise<number>;

/** `RunProcess` over `spawn`: no shell, both streams read line by line until the process closes them. */
export const spawnRunner: RunProcess = (file, args, env, onLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    createInterface({ input: child.stdout }).on('line', (line) => onLine('stdout', line));
    createInterface({ input: child.stderr }).on('line', (line) => onLine('stderr', line));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === null) reject(new Error(`${file} was killed by ${signal ?? 'a signal'}`));
      else resolve(code);
    });
  });

export interface ImportDumpDeps {
  bucket: string;
  /** The archive's key under the bucket; its base name is the archive's name on disk. */
  key: string;
  /** Where the archive and the list are written: a directory of the caller's, emptied by nobody here. */
  workDir: string;
  /** Fetches `s3://<bucket>/<key>` into the file at `to`. */
  download: (bucket: string, key: string, to: string) => Promise<void>;
  run: RunProcess;
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
}

export interface ImportOutcome {
  archive: string;
  kept: number;
  dropped: string[];
  /** `pg_restore`'s own exit code: the task's.  */
  exitCode: number;
}

/** The import, start to end: download, list, filter, restore. A listing that fails throws; a restore that fails is the outcome's exit code. */
export async function importDump({
  bucket,
  key,
  workDir,
  download,
  run,
  env,
  log,
}: ImportDumpDeps): Promise<ImportOutcome> {
  const archive = join(workDir, basename(key));
  log(`downloading s3://${bucket}/${key} to ${archive}`);
  await download(bucket, key, archive);

  const listed: string[] = [];
  const listing = await run('pg_restore', ['--list', archive], env, (stream, line) => {
    if (stream === 'stdout') listed.push(line);
    else log(line);
  });
  if (listing !== 0) throw new Error(`pg_restore --list ${archive} exited ${listing}`);
  const { lines, kept, dropped } = filterToc(listed);
  for (const entry of dropped) log(`skipping ${entry}`);
  const list = join(workDir, 'restore.list');
  await writeFile(list, `${lines.join('\n')}\n`, 'utf8');

  const command = restoreCommand(env, list, archive);
  log(`${command.file} ${command.args.join(' ')}`);
  const exitCode = await run(command.file, command.args, command.env, (_stream, line) => log(line));
  log(
    exitCode === 0
      ? `restored ${key}: ${kept} entries, ${dropped.length} skipped`
      : `pg_restore exited ${exitCode}`,
  );
  return { archive, kept, dropped, exitCode };
}
