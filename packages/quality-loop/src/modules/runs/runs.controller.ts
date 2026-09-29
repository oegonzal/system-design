import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  GetQualityRunResponse,
  ListQualityRunsResponse,
  StartQualityRunRequest,
  StartQualityRunResponse,
} from '@sysdesign/contracts';

import { listRunsQuerySchema, type ListRunsQuery } from './list-runs-query';
import { runRequestSchema } from './run-request';
import { RunsService } from './runs.service';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

@Controller('runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  /** 202: the run is minutes long on the subscription client; poll `GET /runs/:id`. */
  @Post()
  @HttpCode(202)
  async start(
    @Body(new ZodValidationPipe(runRequestSchema)) body: StartQualityRunRequest,
  ): Promise<StartQualityRunResponse> {
    const record = await this.runs.start(body);
    return { data: { runId: record.runId, status: record.status } };
  }

  /** Newest first. Declared before `:id` so the bare collection never reads as an id. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(listRunsQuerySchema)) query: ListRunsQuery,
  ): Promise<ListQualityRunsResponse> {
    const [data, total] = await this.runs.listRuns(query);
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetQualityRunResponse> {
    const run = await this.runs.get(id);
    if (!run) throw new NotFoundException(`run ${id} not found`);
    return { data: run };
  }
}
