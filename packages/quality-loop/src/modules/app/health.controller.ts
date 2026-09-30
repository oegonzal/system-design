import { Controller, Get, Inject } from '@nestjs/common';
import type { LlmModelDto } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import { QUALITY_LOOP_LLM } from '../runs/tokens';

/**
 * Liveness, plus which model backs the loop — a booted loop always has one,
 * so a client that reaches this knows grading can run.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(QUALITY_LOOP_LLM) private readonly llm: LlmClient) {}

  @Get()
  health(): { status: 'ok'; llm: LlmModelDto } {
    return { status: 'ok', llm: { model: this.llm.model } };
  }
}
