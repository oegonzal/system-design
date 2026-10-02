/**
 * Reading a run folder back, as the inverse of the writer beside it.
 *
 * One rule shapes the whole file: **no path is ever assembled from caller
 * input.** The folder is walked once into a map of relative POSIX keys to
 * absolute paths, and a read resolves only through that map. So `../secrets` is
 * not rejected by a rule that has to be remembered — it simply is not a key.
 * That is the doctrine the prompt library already writes down, applied where the
 * input comes off an HTTP request rather than a config file.
 *
 * Async, unlike the writer: this runs on a request thread the service shares
 * with live heartbeats, where a synchronous walk of several hundred files would
 * block them.
 *
 * Absence is `null` and says nothing about why — the two stores legitimately
 * diverge, since a dump folder is written by the loop and a run row by the
 * database. A file that exists but cannot be served comes back in band with the
 * problem named, carrying no stack and no server path: the audit trail must be
 * readable even where one file of it is not.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { isRunId } from './run-id';

/**
 * Above the largest file any recorded dump holds by a wide margin (measured:
 * 391 KB across every folder on disk), so the bound is headroom rather than a
 * limit a real record meets. It exists so one pathological file cannot be asked
 * for into memory on a request thread.
 */
export const MAX_DUMP_FILE_BYTES = 2 * 1024 * 1024;

export interface DumpEntry {
  /** Relative to the run folder, POSIX-spelled. The only name a caller may use. */
  path: string;
  bytes: number;
}

export interface DumpFileRead extends DumpEntry {
  /**
   * The bytes as text. A JSON file comes back as text and not parsed: parsing is
   * the step that turns bytes into the loop's own types, and a trail must be
   * readable even when one of its files is malformed.
   */
  text: string | null;
  /** Why there is no text, named without a stack and without a server path. */
  problem: string | null;
}

/**
 * Every regular file under `root`, keyed by its path relative to it.
 *
 * A symbolic link is skipped rather than followed: a link is the one way a file
 * inside the folder could name bytes outside it, and the audit trail has no use
 * for one.
 */
async function walk(root: string, prefix: string, into: Map<string, string>): Promise<void> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  for (const entry of entries) {
    const key = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(root, key, into);
      continue;
    }
    if (!entry.isFile()) continue;
    into.set(key, join(root, key));
  }
}

/** The map a read resolves through, or null when there is no such folder. */
async function indexOf(dir: string, runId: string): Promise<Map<string, string> | null> {
  // Checked before any syscall: an id this package could not have minted never
  // becomes a path.
  if (!isRunId(runId)) return null;
  const root = join(dir, runId);
  const found = new Map<string, string>();
  try {
    await walk(root, '', found);
  } catch {
    return null;
  }
  return found;
}

/** The file's size, or -1 when it cannot be measured. */
const sizeOf = (absolute: string): Promise<number> =>
  stat(absolute).then(
    (info) => info.size,
    () => -1,
  );

/** Every file of one run's dump, sorted by path. Null when the folder is not there. */
export async function listDump(dir: string, runId: string): Promise<DumpEntry[] | null> {
  const found = await indexOf(dir, runId);
  if (found === null) return null;
  const entries = await Promise.all(
    // A size that cannot be read is reported as zero rather than dropping the
    // file: the name is the useful part, and one unreadable file must not take
    // the listing with it.
    [...found].map(async ([path, absolute]): Promise<DumpEntry> => ({
      path,
      bytes: Math.max(0, await sizeOf(absolute)),
    })),
  );
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * One file of one run's dump. Null when the folder or the name is not there;
 * an in-band problem when the name is a key but the bytes cannot be served.
 */
export async function readDumpFile(
  dir: string,
  runId: string,
  path: string,
): Promise<DumpFileRead | null> {
  const found = await indexOf(dir, runId);
  const absolute = found?.get(path);
  if (found === null || absolute === undefined) return null;
  const bytes = await sizeOf(absolute);
  if (bytes < 0) {
    return { path, bytes: 0, text: null, problem: 'the file could not be measured' };
  }
  if (bytes > MAX_DUMP_FILE_BYTES) {
    return {
      path,
      bytes,
      text: null,
      problem: `the file is ${bytes} bytes, past the ${MAX_DUMP_FILE_BYTES} this reader serves`,
    };
  }
  try {
    return { path, bytes, text: await readFile(absolute, 'utf8'), problem: null };
  } catch {
    return { path, bytes, text: null, problem: 'the file could not be read' };
  }
}
