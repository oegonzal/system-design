/**
 * Run-folder plumbing for the quality loop's dumps.
 *
 * What lives here is deliberately only the payload-AGNOSTIC half: a run id, a
 * list of files, one index line. The records themselves are laid out by the
 * loop (`quality-loop/src/dump/build-run-dump.ts`), which owns their types, and
 * written by its trace store; the code review mints its run ids here too.
 *
 * Three rules here, each earned:
 *
 * 1. **The caller owns failure.** A write the disk refuses throws. The trace
 *    store catches and logs it, because it runs from a `finally` where a throw
 *    would replace the run's own outcome and skip closing its row.
 * 2. **Write each file through a temp name and rename.** A process killed
 *    mid-write must not leave half a JSON file for every later reader to trip
 *    over.
 * 3. **Append the index row last.** The row is the claim that a folder is
 *    complete, so a half-written run is never indexed. One small flat line per
 *    run keeps the append atomic — several processes share this directory.
 *
 * Synchronous `fs` is deliberate: the one writer has no throughput to protect,
 * and async would only add an unawaited promise to a path that must not fail.
 */
import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/** Bump when a field changes meaning, so a later reader can tell records apart. */
export const DUMP_SCHEMA_VERSION = 1;

export const INDEX_FILE = 'index.jsonl';

export interface DumpFile {
  /** Relative to the run folder. */
  path: string;
  content: string;
}

/** A file that is not text — a screenshot — written as its bytes. */
export interface DumpBytes {
  /** Relative to the run folder. */
  path: string;
  bytes: Uint8Array;
}

const payloadOf = (file: DumpFile | DumpBytes): string | Uint8Array =>
  'bytes' in file ? file.bytes : file.content;

export interface BuiltDump {
  runId: string;
  files: DumpFile[];
  /** One flat line for `index.jsonl`, appended only once the folder is whole. */
  indexRow: string;
}

export interface GitContext {
  branch: string;
  headSha: string;
}

export interface WriteResult {
  runDir: string;
}

/**
 * Files under `dir/<runId>`, each through a temp name and a rename, and no
 * index row: for a writer that fills a folder as it goes — a browser session
 * writing one step at a time — and indexes it once at the end. Throws when a
 * write fails.
 */
export function writeDumpFiles(
  runId: string,
  files: readonly (DumpFile | DumpBytes)[],
  dir: string,
): WriteResult {
  const runDir = join(dir, runId);

  for (const file of files) {
    const target = join(runDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.tmp`;
    writeFileSync(temp, payloadOf(file));
    renameSync(temp, target);
  }

  return { runDir };
}

/** The claim that a folder is complete — one flat line, appended once the folder is whole. */
export function appendIndexRow(indexRow: string, dir: string): void {
  appendFileSync(join(dir, INDEX_FILE), indexRow);
}

/**
 * Every file under `dir/<runId>`, then the index row. Throws when a write
 * fails, leaving that run unindexed — a caller in a `finally` must catch.
 */
export function writeDump(dump: BuiltDump, dir: string): WriteResult {
  const result = writeDumpFiles(dump.runId, dump.files, dir);
  appendIndexRow(dump.indexRow, dir);
  return result;
}

let git: GitContext | null = null;

/**
 * Read once, on first use, not per run: a long-lived service's HEAD does not
 * move, and two `git` subprocesses on every submission is a real cost on a
 * background loop's hot path. Lazy, so importing this package spawns nothing.
 */
export function gitContext(): GitContext {
  git ??= readGit();
  return git;
}

function readGit(): GitContext {
  const run = (args: string[]): string => {
    try {
      return execFileSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };
  return {
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    headSha: run(['rev-parse', 'HEAD']),
  };
}
