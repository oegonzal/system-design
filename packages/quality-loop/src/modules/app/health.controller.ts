import { Controller, Get, Inject } from '@nestjs/common';
import type { QualityLoopHealthDto } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import { runHeartbeat, type RunJanitorOptions } from '../janitor/stale-after';
import { RUN_JANITOR_OPTIONS } from '../janitor/tokens';
import { QUALITY_LOOP_LLM } from '../runs/tokens';

/**
 * Liveness, plus which model backs the loop — a booted loop always has one,
 * so a client that reaches this knows grading can run — and the pace its runs
 * keep, read from the janitor's own options: how a client tells a quiet run
 * from a dead one by the loop's numbers rather than a copy of them.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(QUALITY_LOOP_LLM) private readonly llm: LlmClient,
    @Inject(RUN_JANITOR_OPTIONS) private readonly janitor: RunJanitorOptions,
  ) {}

  @Get()
  health(): QualityLoopHealthDto {
    return {
      status: 'ok',
      llm: { model: this.llm.model },
      heartbeat: runHeartbeat(this.janitor),
    };
  }
}
