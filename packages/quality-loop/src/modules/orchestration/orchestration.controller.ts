import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  GetOrchestrationRunResponse,
  ListOrchestrationRunsResponse,
  StartOrchestrationFromRunRequest,
  StartOrchestrationRequest,
  StartOrchestrationResponse,
} from '@sysdesign/contracts';

import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { orNotFound } from '../http/or-not-found';
import { page } from '../http/paging';
import {
  fromRunRequestSchema,
  listOrchestrationsQuerySchema,
  orchestrationRequestSchema,
  type ListOrchestrationsQuery,
} from './orchestration-request';
import { OrchestrationService } from './orchestration.service';

@Controller('orchestrations')
export class OrchestrationController {
  constructor(private readonly orchestrations: OrchestrationService) {}

  /** 202: several chained runs are many minutes on the subscription client; poll `GET /orchestrations/:id`. */
  @Post(':orchestrator')
  @HttpCode(202)
  async start(
    @Param('orchestrator') orchestrator: string,
    @Body(new ZodValidationPipe(orchestrationRequestSchema)) body: StartOrchestrationRequest,
  ): Promise<StartOrchestrationResponse> {
    const record = await this.orchestrations.start(orchestrator, body);
    return { data: { orchestrationRunId: record.orchestrationRunId, status: record.status } };
  }

  /** 202: start from an already persisted run, for the steps the orchestrator lets it stand in for. */
  @Post(':orchestrator/from-run')
  @HttpCode(202)
  async fromRun(
    @Param('orchestrator') orchestrator: string,
    @Body(new ZodValidationPipe(fromRunRequestSchema)) body: StartOrchestrationFromRunRequest,
  ): Promise<StartOrchestrationResponse> {
    const record = await this.orchestrations.startFromRun(orchestrator, body);
    return { data: { orchestrationRunId: record.orchestrationRunId, status: record.status } };
  }

  /** Newest first. Declared before `:id` so the bare collection never reads as an id. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(listOrchestrationsQuerySchema)) query: ListOrchestrationsQuery,
  ): Promise<ListOrchestrationRunsResponse> {
    const [data, total] = await this.orchestrations.list(query);
    return page(data, total, query);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetOrchestrationRunResponse> {
    const record = await this.orchestrations.get(id);
    return { data: orNotFound(record, `orchestration run ${id} not found`) };
  }
}
