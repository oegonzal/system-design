/**
 * The session dump on disk, through the loop's shared plumbing: each file
 * written temp-and-rename, one index row per session once it is whole. The
 * layout is the core's (`core/session-dump`); only the writing is here.
 */
import { appendIndexRow, makeRunId, writeDumpFiles } from '@sysdesign/run-dump';

import type { DumpStore } from '../../core/ports';

export function fsDumpStore(dir: string): DumpStore {
  return {
    open(now) {
      const runId = makeRunId(now.getTime(), 'session');
      return {
        runId,
        write: (files) => {
          writeDumpFiles(runId, files, dir);
        },
        index: (row) => appendIndexRow(row, dir),
      };
    },
  };
}
