import { Logger } from '@nestjs/common';
import type { PipelineSummary } from '@sysdesign/contracts';
import { describeError, writeDump } from '@sysdesign/run-dump';

import type { RunRecord } from '../../core/contracts';
import type { TraceStore } from '../../core/ports';
import { buildRunDump } from '../../dump/build-run-dump';

/**
 * The durable record of a run: a folder under `dir`. Never throws — the run
 * saves from a `finally`, and a dump the disk refuses must not stop it closing
 * its row — so a failed write is logged and the run goes on without it.
 */
export class DumpTraceStore implements TraceStore {
  private readonly logger = new Logger(DumpTraceStore.name);

  constructor(private readonly dir: string) {}

  save(record: RunRecord, pipeline: PipelineSummary | null): void {
    try {
      const { runDir } = writeDump(buildRunDump(record, pipeline), this.dir);
      this.logger.log(`run ${record.runId} ${record.status} → ${runDir}`);
    } catch (error) {
      this.logger.error(`run ${record.runId}: dump not written: ${describeError(error).message}`);
    }
  }
}
