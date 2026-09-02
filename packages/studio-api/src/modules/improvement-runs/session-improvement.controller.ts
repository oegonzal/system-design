import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { StartImprovementRunResponse } from '@sysdesign/contracts';

import { ok } from '../../common/envelope';
import { StartImprovementRunRequestDto } from './dto/start-improvement-run.dto';
import { toImprovementRunDto } from './improvement-runs.mapper';
import { ImprovementRunsService } from './improvement-runs.service';

/**
 * The session-scoped start route. A second `@Controller('sessions')` class in
 * this module rather than a method on SessionsController — Nest merges the
 * prefix, and the improvement module keeps its whole surface without a module
 * cycle.
 */
@Controller('sessions')
export class SessionImprovementController {
  constructor(private readonly runs: ImprovementRunsService) {}

  /** 202: accepted — the eval worker's improvement poller does the work. */
  @Post(':id/improvement-runs')
  @HttpCode(202)
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartImprovementRunRequestDto,
  ): Promise<StartImprovementRunResponse> {
    return ok(toImprovementRunDto(await this.runs.start(id, dto)));
  }
}
