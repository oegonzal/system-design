import { createHash } from 'node:crypto';

import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

import type { DumpSink, DumpStore, GoalSource } from './ports';

/**
 * The dump and the goal source as fakes, in memory: what the engine writes
 * and what it reads, kept by path. No vitest import, so the Nest spec can
 * use them too.
 */

/** A dump that keeps its files in memory, by path. */
export class InMemoryDumpStore implements DumpStore {
  readonly files = new Map<string, string | Uint8Array>();
  readonly index: string[] = [];
  readonly runId = 'fake-session-dump';
  /** How many sessions opened a folder here: a refused session opens none. */
  opened = 0;

  open(): DumpSink {
    this.opened += 1;
    return {
      runId: this.runId,
      write: (files: readonly (DumpFile | DumpBytes)[]) => {
        for (const file of files) {
          this.files.set(file.path, 'bytes' in file ? file.bytes : file.content);
        }
      },
      index: (row: string) => {
        this.index.push(row);
      },
    };
  }

  text(path: string): string {
    const file = this.files.get(path);
    if (typeof file !== 'string') throw new Error(`no text file ${path} in the fake dump`);
    return file;
  }
}

/** Goals by path, hashed the way the filesystem source hashes them. */
export class InMemoryGoalSource implements GoalSource {
  constructor(private readonly documents: Record<string, string>) {}

  async read(path: string): Promise<{ path: string; markdown: string; hash: string }> {
    const markdown = this.documents[path];
    if (markdown === undefined) throw new Error(`no goal at ${path}`);
    return { path, markdown, hash: createHash('sha256').update(markdown).digest('hex') };
  }
}
