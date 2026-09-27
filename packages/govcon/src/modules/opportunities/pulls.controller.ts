import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { DEFAULT_PULL_DAYS, type StartPullResponse } from '@sysdesign/contracts';

import { validateWindow, windowEndingAt } from '../../core/plan';
import { ZodValidationPipe } from '../app/zod.pipe';
import { OpportunitiesService } from './opportunities.service';
import { startPullRequestSchema, type StartPullBody } from './start-pull-request';
import { CLOCK } from './tokens';

/**
 * A pull is seconds — one bounded request per slice, stopped by the budget —
 * so it answers synchronously with its report: 200, not 202.
 */
@Controller('pulls')
export class PullsController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Post()
  @HttpCode(200)
  async start(
    @Body(new ZodValidationPipe(startPullRequestSchema)) body: StartPullBody,
  ): Promise<StartPullResponse> {
    const window = this.window(body);
    return { data: await this.opportunities.pull(body.profile, window) };
  }

  private window(body: StartPullBody) {
    try {
      return body.from !== undefined && body.to !== undefined
        ? validateWindow({ from: body.from, to: body.to })
        : windowEndingAt(this.now(), body.days ?? DEFAULT_PULL_DAYS);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }
}
