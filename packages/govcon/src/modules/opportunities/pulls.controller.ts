import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { StartPullResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { OpportunitiesService } from './opportunities.service';
import { startPullRequestSchema, type StartPullBody } from './start-pull-request';

/**
 * A pull is bounded — one request per page, stopped by the budget and by
 * its deadline — so it answers synchronously with its report: 200, not 202.
 */
@Controller('pulls')
export class PullsController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Post()
  @HttpCode(200)
  async start(
    @Body(new ZodValidationPipe(startPullRequestSchema)) body: StartPullBody,
  ): Promise<StartPullResponse> {
    return { data: await this.opportunities.pull(body.profile, body) };
  }
}
