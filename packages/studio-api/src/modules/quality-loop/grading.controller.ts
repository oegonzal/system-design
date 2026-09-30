import { Controller, Get, HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ApiResponse, LlmAvailabilityDto } from '@sysdesign/contracts';

import { ok } from '../../common/envelope';
import { QualityLoopClient, type QualityLoopHealth } from './quality-loop.client';

/**
 * Whether grading and coaching can run right now: the loop's own availability,
 * proxied. An unreachable loop is a 503 here — the one place a client learns
 * the grader is down before it submits anything.
 */
@Controller('grading')
export class GradingController {
  constructor(private readonly loop: QualityLoopClient) {}

  @Get('availability')
  async availability(): Promise<ApiResponse<LlmAvailabilityDto>> {
    let health: QualityLoopHealth;
    try {
      health = await this.loop.health();
    } catch (error) {
      if (error instanceof HttpException) {
        throw new ServiceUnavailableException(
          `the grading service is unreachable: ${error.message}`,
        );
      }
      throw error;
    }
    // A loop that answers but says nothing about a model is an older build,
    // not an available grader: the client must not read `{}` as enabled.
    if (!health.llm) {
      throw new ServiceUnavailableException(
        'the grading service reports no model availability — an older quality loop is running',
      );
    }
    return ok(health.llm);
  }
}
