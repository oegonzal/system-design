import { Controller, Get, Inject } from '@nestjs/common';
import type { LlmAvailabilityDto } from '@sysdesign/contracts';
import { qualityLoopAvailabilityFromEnv, type LlmClient } from '@sysdesign/llm';

import { QUALITY_LOOP_LLM } from '../runs/tokens';

/**
 * Liveness, plus whether a model stands behind the loop — derived facts only,
 * never the key — so a client can explain an unavailable grader before it
 * starts a run that would only escalate.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(QUALITY_LOOP_LLM) private readonly llm: LlmClient) {}

  @Get()
  health(): { status: 'ok'; llm: LlmAvailabilityDto } {
    return {
      status: 'ok',
      llm: {
        enabled: this.llm.enabled,
        model: this.llm.model,
        reason: this.llm.enabled ? null : qualityLoopAvailabilityFromEnv().reason,
      },
    };
  }
}
