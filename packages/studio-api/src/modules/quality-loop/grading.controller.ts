import { Controller, Get, HttpException, ServiceUnavailableException } from '@nestjs/common';
import type {
  GetGradingAvailabilityResponse,
  QualityLoopHealthDto,
  RunHeartbeatDto,
} from '@sysdesign/contracts';

import { ok } from '../../common/envelope';
import { QualityLoopClient } from './quality-loop.client';

/** The loop's pace as it reported it, when both of its numbers are a positive duration. */
function reportedHeartbeat(heartbeat: unknown): RunHeartbeatDto | null {
  if (typeof heartbeat !== 'object' || heartbeat === null) return null;
  const { heartbeatEveryMs, staleAfterMs } = heartbeat as Partial<Record<string, unknown>>;
  const positive = (ms: unknown): ms is number =>
    typeof ms === 'number' && Number.isFinite(ms) && ms > 0;
  return positive(heartbeatEveryMs) && positive(staleAfterMs)
    ? { heartbeatEveryMs, staleAfterMs }
    : null;
}

/**
 * Whether grading and coaching can run right now: the loop's own model
 * report, proxied, with the pace its runs keep — what the studio judges a
 * quiet run by. A booted loop always has a model, so the only way to be
 * unavailable is to be unreachable — a 503 here, the one place a client
 * learns the grader is down before it submits anything.
 */
@Controller('grading')
export class GradingController {
  constructor(private readonly loop: QualityLoopClient) {}

  @Get('availability')
  async availability(): Promise<GetGradingAvailabilityResponse> {
    let health: QualityLoopHealthDto;
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
    // A loop that answers but names no model, or no pace, is an older build,
    // not an available grader: the client must not read `{}` as ready.
    if (typeof health.llm?.model !== 'string') {
      throw new ServiceUnavailableException(
        'the grading service reports no model — an older quality loop is running',
      );
    }
    const heartbeat = reportedHeartbeat(health.heartbeat);
    if (heartbeat === null) {
      throw new ServiceUnavailableException(
        'the grading service reports no heartbeat pace — an older quality loop is running',
      );
    }
    return ok({ model: health.llm.model, heartbeat });
  }
}
