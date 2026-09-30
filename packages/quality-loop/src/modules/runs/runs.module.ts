import { Module } from '@nestjs/common';
import { createQualityLoopLlmFromEnv } from '@sysdesign/llm';

import { JanitorModule } from '../janitor/janitor.module';
import { CriteriaController } from './criteria.controller';
import { DumpTraceStore } from './dump-trace-store';
import { PipelinesModule } from './pipelines.module';
import { PipelinesController } from './pipelines.controller';
import { RunsController } from './runs.controller';
import { RunsPersistenceModule } from './runs-persistence.module';
import { RunsService } from './runs.service';
import { QUALITY_LOOP_LLM, TRACE_STORE } from './tokens';

@Module({
  imports: [PipelinesModule, RunsPersistenceModule, JanitorModule],
  controllers: [RunsController, PipelinesController, CriteriaController],
  providers: [
    RunsService,
    // The environment decides once, at boot: a key, the subscription route
    // under QUALITY_LOOP_AUTH=claude-code, else no-op (and always no-op under
    // QUALITY_LOOP_DETERMINISTIC=1).
    { provide: QUALITY_LOOP_LLM, useFactory: createQualityLoopLlmFromEnv },
    { provide: TRACE_STORE, useClass: DumpTraceStore },
  ],
  // The memory module composes pipelines through this one service, and derives
  // its retrieval probes with the same client the loop decided on at boot.
  exports: [RunsService, QUALITY_LOOP_LLM, PipelinesModule, RunsPersistenceModule],
})
export class RunsModule {}
