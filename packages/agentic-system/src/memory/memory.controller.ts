import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { MemoryService } from '@sysdesign/agentic-memory';
import {
  consolidateRequestSchema,
  createSpaceRequestSchema,
  invalidateRecordRequestSchema,
  recallRecordsRequestSchema,
  recordHistoryRequestSchema,
  rememberRequestSchema,
  updateRecordRequestSchema,
  type ApiResponse,
  type ConsolidationResultDto,
  type MemoryRecordDto,
  type MemorySpaceDto,
  type RecallResultDto,
  type WriteResultDto,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';
import type { z } from 'zod';

import { answered, notCompiled } from './refusals';
import { SpacesService } from './spaces.service';

/** A route's body as the pipe hands it on: the contract's schema, its defaults applied. */
type BodyOf<S extends z.ZodType> = z.output<S>;

/**
 * Memory spaces over HTTP: one made from a design run, read back, and each
 * memory verb the runtime serves on it. A verb answers 200 with what it did;
 * a refusal answers its one declared status (`refusals.ts`), and a body the
 * contract does not accept is the pipe's 400.
 */
@Controller('spaces')
export class MemoryController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly memory: MemoryService,
  ) {}

  /** 201 with the space and its compile report; a strategy that does not compile is 422 with the report. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createSpaceRequestSchema))
    body: BodyOf<typeof createSpaceRequestSchema>,
  ): Promise<ApiResponse<MemorySpaceDto>> {
    const created = await answered(() => this.spaces.createFromRun(body.runId));
    if ('report' in created) throw notCompiled(created.report);
    return { data: created.space };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponse<MemorySpaceDto>> {
    return { data: await answered(() => this.memory.getSpace(id)) };
  }

  @Post(':id/remember')
  @HttpCode(200)
  async remember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rememberRequestSchema)) body: BodyOf<typeof rememberRequestSchema>,
  ): Promise<ApiResponse<WriteResultDto>> {
    return { data: await answered(() => this.memory.remember(id, body)) };
  }

  @Post(':id/update')
  @HttpCode(200)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecordRequestSchema))
    body: BodyOf<typeof updateRecordRequestSchema>,
  ): Promise<ApiResponse<WriteResultDto>> {
    return { data: await answered(() => this.memory.update(id, body)) };
  }

  @Post(':id/invalidate')
  @HttpCode(200)
  async invalidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(invalidateRecordRequestSchema))
    body: BodyOf<typeof invalidateRecordRequestSchema>,
  ): Promise<ApiResponse<MemoryRecordDto>> {
    return { data: await answered(() => this.memory.invalidate(id, body)) };
  }

  @Post(':id/recall')
  @HttpCode(200)
  async recall(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recallRecordsRequestSchema))
    body: BodyOf<typeof recallRecordsRequestSchema>,
  ): Promise<ApiResponse<RecallResultDto>> {
    return { data: await answered(() => this.memory.recall(id, body)) };
  }

  @Post(':id/consolidate')
  @HttpCode(200)
  async consolidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(consolidateRequestSchema))
    body: BodyOf<typeof consolidateRequestSchema>,
  ): Promise<ApiResponse<ConsolidationResultDto>> {
    return { data: await answered(() => this.memory.consolidate(id, body)) };
  }

  /** Every version of the addressed record's identity, oldest first. */
  @Post(':id/history')
  @HttpCode(200)
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordHistoryRequestSchema))
    body: BodyOf<typeof recordHistoryRequestSchema>,
  ): Promise<ApiResponse<MemoryRecordDto[]>> {
    return { data: await answered(() => this.memory.history(id, body)) };
  }
}
