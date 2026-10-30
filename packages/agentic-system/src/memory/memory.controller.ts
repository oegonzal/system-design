import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { MemoryService } from '@sysdesign/agentic-memory';
import {
  consolidateRequestSchema,
  createSpaceRequestSchema,
  invalidateRecordRequestSchema,
  recallRecordsRequestSchema,
  recordHistoryRequestSchema,
  rememberRequestSchema,
  spaceNameSchema,
  updateRecordRequestSchema,
  type ApiResponse,
  type ConsolidationResultDto,
  type EnsuredSpaceDto,
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
 * Memory spaces over HTTP: one made from a design run or ensured under a name,
 * read back by id or by name, and each memory verb the runtime serves on it. A
 * verb answers 200 with what it did; a refusal answers its one declared status
 * (`refusals.ts`), and a body or a name the contract does not accept is the
 * pipe's 400. The by-name routes are declared before the `:id` ones, so a
 * name is never read as an id.
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

  /**
   * 200 with the space under this name and whether this call made it: made
   * from the run when none holds the name, the same space when that run made
   * it. A name another run holds is 409; a strategy that does not compile is
   * 422 with the report.
   */
  @Put('by-name/:name')
  async ensure(
    @Param('name', new ZodValidationPipe(spaceNameSchema)) name: string,
    @Body(new ZodValidationPipe(createSpaceRequestSchema))
    body: BodyOf<typeof createSpaceRequestSchema>,
  ): Promise<ApiResponse<EnsuredSpaceDto>> {
    const ensured = await answered(() => this.spaces.ensureNamed(name, body.runId));
    if ('report' in ensured) throw notCompiled(ensured.report);
    return { data: ensured };
  }

  @Get('by-name/:name')
  async getByName(
    @Param('name', new ZodValidationPipe(spaceNameSchema)) name: string,
  ): Promise<ApiResponse<MemorySpaceDto>> {
    return { data: await answered(() => this.memory.getSpaceByName(name)) };
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
