import { Controller, Get, HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ApiResponse, LlmModelDto } from '@sysdesign/contracts';

import { ok } from '../../common/envelope';
import { QualityLoopClient, type QualityLoopHealth } from './quality-loop.client';

/**
 * Whether grading and coaching can run right now: the loop's own model
 * report, proxied. A booted loop always has a model, so the only way to be
 * unavailable is to be unreachable — a 503 here, the one place a client
 * learns the grader is down before it submits anything.
 */
@Controller('grading')
export class GradingController {
  constructor(private readonly loop: QualityLoopClient) {}

  @Get('availability')
  async availability(): Promise<ApiResponse<LlmModelDto>> {
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
    // A loop that answers but names no model is an older build, not an
    // available grader: the client must not read `{}` as ready.
    if (typeof health.llm?.model !== 'string') {
      throw new ServiceUnavailableException(
        'the grading service reports no model — an older quality loop is running',
      );
    }
    return ok({ model: health.llm.model });
  }
}
