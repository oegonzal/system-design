import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  QualityRun,
  QualityRunCriterion,
  QualityRunCriterionResult,
  QualityRunFinding,
  QualityRunIteration,
} from '@sysdesign/db';
import { createQualityLoopLlmFromEnv } from '@sysdesign/llm';

import { PIPELINES } from '../../pipelines';
import { DumpTraceStore } from './dump-trace-store';
import { MikroOrmRunRepository } from './persistence/mikro-orm-run-repository';
import { PipelinesController } from './pipelines.controller';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM, RUN_REPOSITORY, TRACE_STORE } from './tokens';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      QualityRun,
      QualityRunCriterion,
      QualityRunIteration,
      QualityRunFinding,
      QualityRunCriterionResult,
    ]),
  ],
  controllers: [RunsController, PipelinesController],
  providers: [
    RunsService,
    // The environment decides once, at boot: a key, the subscription route
    // under QUALITY_LOOP_AUTH=claude-code, else no-op (and always no-op under
    // QUALITY_LOOP_DETERMINISTIC=1, falling back to EVAL_DETERMINISTIC).
    { provide: QUALITY_LOOP_LLM, useFactory: createQualityLoopLlmFromEnv },
    { provide: PIPELINES_TOKEN, useValue: PIPELINES },
    { provide: TRACE_STORE, useClass: DumpTraceStore },
    { provide: RUN_REPOSITORY, useClass: MikroOrmRunRepository },
  ],
  // The memory module composes pipelines through this one service, and derives
  // its retrieval probes with the same client the loop decided on at boot.
  exports: [RunsService, QUALITY_LOOP_LLM],
})
export class RunsModule {}
