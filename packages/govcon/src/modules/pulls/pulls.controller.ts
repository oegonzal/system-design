import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { RunSearchResponse, StartPullResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { PullService } from './pull.service';
import {
  runSavedSearchSchema,
  runSearchRequestSchema,
  startPullRequestSchema,
  type RunSavedSearchBody,
  type RunSearchBody,
  type StartPullBody,
} from './start-pull-request';

/**
 * A pull is bounded — one request per page, stopped by the budget and by
 * its deadline — so it answers synchronously with its report: 200, not 202.
 */
@Controller('pulls')
export class PullsController {
  constructor(private readonly pulls: PullService) {}

  @Post()
  @HttpCode(200)
  async start(
    @Body(new ZodValidationPipe(startPullRequestSchema)) body: StartPullBody,
  ): Promise<StartPullResponse> {
    return { data: await this.pulls.pull(body.profile, body) };
  }
}

/** Running a search is a pull of one slice: the same report, the same bounds. */
@Controller('searches')
export class SearchRunsController {
  constructor(private readonly pulls: PullService) {}

  @Post('run')
  @HttpCode(200)
  async runFilter(
    @Body(new ZodValidationPipe(runSearchRequestSchema)) body: RunSearchBody,
  ): Promise<RunSearchResponse> {
    return { data: await this.pulls.runFilter(body.profile, body.filter, body) };
  }

  @Post(':id/run')
  @HttpCode(200)
  async runSaved(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(runSavedSearchSchema)) body: RunSavedSearchBody,
  ): Promise<RunSearchResponse> {
    return { data: await this.pulls.runSaved(id, body) };
  }
}
