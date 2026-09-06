import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import type { ApiResponse } from '@sysdesign/contracts';

import type { RunRecord, RunRequest } from '../../core/contracts';
import { runRequestSchema } from './run-request';
import { RunsService } from './runs.service';
import { ZodValidationPipe } from './zod.pipe';

@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  /** 202: the run is minutes long on the subscription client; poll `GET /runs/:id`. */
  @Post()
  @HttpCode(202)
  start(
    @Body(new ZodValidationPipe(runRequestSchema)) body: RunRequest,
  ): ApiResponse<{ runId: string; status: RunRecord['status'] }> {
    const record = this.runs.start(body);
    return { data: { runId: record.runId, status: record.status } };
  }

  @Get(':id')
  get(@Param('id') id: string): ApiResponse<RunRecord> {
    const record = this.runs.get(id);
    if (!record) throw new NotFoundException(`run ${id} not found`);
    return { data: record };
  }
}
