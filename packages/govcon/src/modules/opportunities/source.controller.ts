import { Controller, Get, Query } from '@nestjs/common';
import type { GetSourceResponse, ListSourceCallsResponse } from '@sysdesign/contracts';

import { ZodValidationPipe } from '../app/zod.pipe';
import { listCallsQuerySchema, type ListCallsQueryInput } from './list-calls-query';
import { OpportunitiesService } from './opportunities.service';

/** The upstream: what it is, how much budget is left, and every call made to it. */
@Controller('source')
export class SourceController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  async status(): Promise<GetSourceResponse> {
    return { data: await this.opportunities.status() };
  }

  /** Newest first. */
  @Get('calls')
  async calls(
    @Query(new ZodValidationPipe(listCallsQuerySchema)) query: ListCallsQueryInput,
  ): Promise<ListSourceCallsResponse> {
    const [data, total] = await this.opportunities.calls(query);
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }
}
