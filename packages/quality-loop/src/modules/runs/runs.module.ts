import { Module } from '@nestjs/common';
import { createQualityLoopLlmFromEnv } from '@sysdesign/llm';
import { join } from 'node:path';

import { JanitorModule } from '../janitor/janitor.module';
import { CriteriaController } from './criteria.controller';
import { DumpTraceStore } from './dump-trace-store';
import { PipelinesModule } from './pipelines.module';
import { PipelinesController } from './pipelines.controller';
import { RunDumpController } from './run-dump.controller';
import { RunsController } from './runs.controller';
import { RunsPersistenceModule } from './runs-persistence.module';
import { RunsService } from './runs.service';
import { QUALITY_LOOP_LLM, RUN_DUMP_DIR, TRACE_STORE } from './tokens';

/**
 * Where run dumps go. The repo root is the cwd for both `nx serve` and
 * `node packages/quality-loop/dist/main.js`; `static/runs` means real runs, so
 * the specs point this at a temp directory.
 */
export const dumpDir = (): string =>
  process.env['QUALITY_LOOP_DUMP_DIR'] ?? join(process.cwd(), 'static', 'runs');

@Module({
  imports: [PipelinesModule, RunsPersistenceModule, JanitorModule],
  controllers: [RunsController, RunDumpController, PipelinesController, CriteriaController],
  providers: [
    RunsService,
    // The subscription client, once, at boot — main.ts already refused to
    // start without a Claude Code login.
    { provide: QUALITY_LOOP_LLM, useFactory: createQualityLoopLlmFromEnv },
    // One value for both halves: the store writes where the reader reads.
    { provide: RUN_DUMP_DIR, useFactory: dumpDir },
    { provide: TRACE_STORE, useFactory: () => new DumpTraceStore(dumpDir()) },
  ],
  // The memory module composes pipelines through this one service, and derives
  // its retrieval probes with the same client the loop decided on at boot.
  exports: [RunsService, QUALITY_LOOP_LLM, PipelinesModule, RunsPersistenceModule],
})
export class RunsModule {}
