import { Injectable, Logger } from '@nestjs/common';
import type { PipelineSummary } from '@sysdesign/contracts';
import { writeDump } from '@sysdesign/run-dump';

import type { RunRecord } from '../../core/contracts';
import type { TraceStore } from '../../core/ports';
import { buildRunDump } from '../../dump/build-run-dump';

/** The durable record of a run: a folder under the run-dump directory. Never throws. */
@Injectable()
export class DumpTraceStore implements TraceStore {
  private readonly logger = new Logger(DumpTraceStore.name);

  save(record: RunRecord, pipeline: PipelineSummary | null): void {
    const { runDir } = writeDump(buildRunDump(record, pipeline));
    this.logger.log(`run ${record.runId} ${record.status} → ${runDir}`);
  }
}
