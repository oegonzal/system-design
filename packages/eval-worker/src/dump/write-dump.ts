/**
 * The only I/O in the dump path.
 *
 * Three rules, each earned:
 *
 * 1. **Never throw.** The caller invokes this from a `finally`. A throw there
 *    replaces whatever error the run was already reporting, turning a retryable
 *    failure into a crashed poll tick.
 * 2. **Write each file through a temp name and rename.** A worker killed
 *    mid-write must not leave half a JSON file behind for every later reader to
 *    trip over.
 * 3. **Append the index row last.** The row is the claim that a run folder is
 *    complete; a half-written folder must never be indexed. One small flat line
 *    per run keeps the append atomic, which matters because several worker
 *    processes can share this directory.
 *
 * Synchronous `fs` is deliberate: the poller re-arms only after a tick settles,
 * so there is no throughput to protect, and async would only add an unawaited
 * promise to a path that must not fail.
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import type { BuiltDump, GitContext } from './eval-dump';

export const INDEX_FILE = 'index.jsonl';

/**
 * `EVAL_DUMP_DIR` exists so test suites can point this at a temp directory —
 * `static/runs` should keep meaning *real runs* — and as the escape hatch if
 * the tree ever needs to live on another disk.
 */
export function dumpDir(env: NodeJS.ProcessEnv = process.env): string {
  return env['EVAL_DUMP_DIR'] ?? join(process.cwd(), 'static', 'runs');
}

export interface WriteResult {
  runDir: string;
}

export function writeDump(dump: BuiltDump, dir = dumpDir()): WriteResult {
  const runDir = join(dir, dump.runId);

  for (const file of dump.files) {
    const target = join(runDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.tmp`;
    writeFileSync(temp, file.content);
    renameSync(temp, target);
  }

  appendFileSync(join(dir, INDEX_FILE), dump.indexRow);
  return { runDir };
}

/**
 * The newest prompt run that produced this prompt, so an evaluation can be read
 * back to the scenario it was answering.
 *
 * Reading the index rather than storing a column means no migration and no
 * schema coupling — and when the prompt predates this feature the link is
 * simply absent, which is honest. `promptId` stays on the manifest either way,
 * so a manual join always works.
 */
export function findPromptRunId(promptId: string, dir = dumpDir()): string | null {
  try {
    const rows = readFileSync(join(dir, INDEX_FILE), 'utf8').split('\n');
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const line = rows[index];
      if (!line) continue;
      const row = JSON.parse(line) as { kind?: string; promptId?: string; runId?: string };
      if (row.kind === 'prompt' && row.promptId === promptId) return row.runId ?? null;
    }
  } catch {
    // No index yet, or a row we cannot read — neither is worth a failed run.
  }
  return null;
}

/**
 * Read once at module load, not per run: a long-lived worker's HEAD does not
 * move, and three `git` subprocesses on every submission is a real cost on a
 * background loop's hot path.
 */
export const GIT_CONTEXT: GitContext = readGit();

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
