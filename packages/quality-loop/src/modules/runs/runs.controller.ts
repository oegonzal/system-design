import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  GetQualityRunResponse,
  ListQualityRunsResponse,
  ReadIterationEvidenceRequest,
  ReadIterationEvidenceResponse,
  StartQualityRunRequest,
  StartQualityRunResponse,
} from '@sysdesign/contracts';

import { page, ZodValidationPipe } from '@sysdesign/nest-kit';

import { orNotFound } from '../http/or-not-found';
import {
  evidenceRequestSchema,
  listRunsQuerySchema,
  runRequestSchema,
  type ListRunsQuery,
} from './run-request';
import { RunsService } from './runs.service';

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

  /** The verdicts of named iterations in one answer; an iteration the loop never recorded is simply absent. */
  @Post('evidence')
  @HttpCode(200)
  async evidence(
    @Body(new ZodValidationPipe(evidenceRequestSchema)) body: ReadIterationEvidenceRequest,
  ): Promise<ReadIterationEvidenceResponse> {
    return { data: await this.runs.evidence(body.iterations) };
  }

  /** Newest first. Declared before `:id` so the bare collection never reads as an id. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(listRunsQuerySchema)) query: ListRunsQuery,
  ): Promise<ListQualityRunsResponse> {
    const [data, total] = await this.runs.listRuns(query);
    return page(data, total, query);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetQualityRunResponse> {
    return { data: orNotFound(await this.runs.get(id), `run ${id} not found`) };
  }
}
