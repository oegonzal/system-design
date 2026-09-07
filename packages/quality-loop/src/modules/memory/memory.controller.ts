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
  DigestRunRequest,
  GetMemoryRunResponse,
  ListMemoryRunsResponse,
  StartMemoryRunRequest,
  StartMemoryRunResponse,
} from '@sysdesign/contracts';

import { ZodValidationPipe } from '../runs/zod.pipe';
import {
  digestRequestSchema,
  listRunsQuerySchema,
  runRequestSchema,
  type ListRunsQuery,
} from './memory-request';
import { MemoryService } from './memory.service';

@Controller('memory-runs')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  /** 202: three runs are many minutes on the subscription client; poll `GET /memory-runs/:id`. */
  @Post()
  @HttpCode(202)
  async start(
    @Body(new ZodValidationPipe(runRequestSchema)) body: StartMemoryRunRequest,
  ): Promise<StartMemoryRunResponse> {
    const record = await this.memory.start(body);
    return { data: { memoryRunId: record.memoryRunId, status: record.status } };
  }

  /** 202: digest an already persisted run and store what it teaches. */
  @Post('digest')
  @HttpCode(202)
  async digest(
    @Body(new ZodValidationPipe(digestRequestSchema)) body: DigestRunRequest,
  ): Promise<StartMemoryRunResponse> {
    const record = await this.memory.startDigest(body.runId);
    return { data: { memoryRunId: record.memoryRunId, status: record.status } };
  }

  /** Newest first. Declared before `:id` so the bare collection never reads as an id. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(listRunsQuerySchema)) query: ListRunsQuery,
  ): Promise<ListMemoryRunsResponse> {
    const [data, total] = await this.memory.list(query);
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetMemoryRunResponse> {
    const record = await this.memory.get(id);
    if (!record) throw new NotFoundException(`memory run ${id} not found`);
    return { data: record };
  }
}
