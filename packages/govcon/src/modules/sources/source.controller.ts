import { Controller, Get, Query } from '@nestjs/common';
import type { GetSourceResponse, ListSourceCallsResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { listCallsQuerySchema, type ListCallsQueryInput } from './list-calls-query';
import { SourceService } from './source.service';

/** The upstream: what it is, how much budget is left, and every call made to it. */
@Controller('source')
export class SourceController {
  constructor(private readonly source: SourceService) {}

  @Get()
  async status(): Promise<GetSourceResponse> {
    return { data: await this.source.status() };
  }

  /** Newest first. */
  @Get('calls')
  async calls(
    @Query(new ZodValidationPipe(listCallsQuerySchema)) query: ListCallsQueryInput,
  ): Promise<ListSourceCallsResponse> {
    const [data, total] = await this.source.calls({ ...query, operation: query.operation ?? null });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }
}
