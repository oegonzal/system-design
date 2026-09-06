import { Module } from '@nestjs/common';
import { createQualityLoopLlmFromEnv } from '@sysdesign/llm';

import { PIPELINES } from '../../pipelines';
import { DumpTraceStore } from './dump-trace-store';
import { PipelinesController } from './pipelines.controller';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, TRACE_STORE } from './tokens';

@Module({
  controllers: [RunsController, PipelinesController],
  providers: [
    RunsService,
    // The environment decides once, at boot: a key, the subscription route
    // under QUALITY_LOOP_AUTH=claude-code, else no-op (and always no-op under
    // QUALITY_LOOP_DETERMINISTIC=1, falling back to EVAL_DETERMINISTIC).
    { provide: QUALITY_LOOP_LLM, useFactory: createQualityLoopLlmFromEnv },
    { provide: PIPELINES_TOKEN, useValue: PIPELINES },
    { provide: TRACE_STORE, useClass: DumpTraceStore },
  ],
})
export class RunsModule {}
