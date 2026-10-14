import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import type {
  GetTargetResponse,
  GetTargetSummaryResponse,
  ListTargetsResponse,
  SaveTargetResponse,
} from '@sysdesign/contracts';
import { page, ZodValidationPipe } from '@sysdesign/nest-kit';

import {
  listTargetsQuerySchema,
  saveTargetSchema,
  targetKeySchema,
  type ListTargetsQueryInput,
  type SaveTargetBody,
  type TargetKeyInput,
} from './target-requests';
import { TargetsService } from './targets.service';

/** The firms and awards the company pursues: listed, counted, and one row put or deleted by what it is about. */
@Controller('targets')
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listTargetsQuerySchema)) query: ListTargetsQueryInput,
  ): Promise<ListTargetsResponse> {
    const [data, total] = await this.targets.list({
      kind: query.kind ?? null,
      stage: query.stage ?? null,
      limit: query.limit,
      offset: query.offset,
    });
    return page(data, total, query);
  }

  @Get('summary')
  async summary(): Promise<GetTargetSummaryResponse> {
    return { data: await this.targets.summary() };
  }

  /** Whether it is tracked is a question, not a lookup that can miss: null when it is not. */
  @Get(':kind/:subject')
  async get(
    @Param(new ZodValidationPipe(targetKeySchema)) key: TargetKeyInput,
  ): Promise<GetTargetResponse> {
    return { data: await this.targets.get(key) };
  }

  @Put(':kind/:subject')
  async save(
    @Param(new ZodValidationPipe(targetKeySchema)) key: TargetKeyInput,
    @Body(new ZodValidationPipe(saveTargetSchema)) body: SaveTargetBody,
  ): Promise<SaveTargetResponse> {
    return { data: await this.targets.save(key, body) };
  }

  @Delete(':kind/:subject')
  @HttpCode(204)
  async remove(@Param(new ZodValidationPipe(targetKeySchema)) key: TargetKeyInput): Promise<void> {
    await this.targets.remove(key);
  }
}
