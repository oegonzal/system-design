import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type {
  FetchAwardsResponse,
  GetAwardsSummaryResponse,
  ListAwardsResponse,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import {
  awardFiltersSchema,
  awardsQuerySchema,
  fetchAwardsRequestSchema,
  type AwardFiltersInput,
  type AwardsQueryInput,
  type FetchAwardsBody,
} from './award-requests';
import { AwardsService } from './awards.service';

/** Stored awards, their summary, and the fetch that spends to bring more in. */
@Controller('awards')
export class AwardsController {
  constructor(private readonly awards: AwardsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(awardsQuerySchema)) query: AwardsQueryInput,
  ): Promise<ListAwardsResponse> {
    const { limit, offset, ...filters } = query;
    const [data, total] = await this.awards.list(filters, limit, offset);
    return { data, meta: { total, limit, offset } };
  }

  @Get('summary')
  async summary(
    @Query(new ZodValidationPipe(awardFiltersSchema)) query: AwardFiltersInput,
  ): Promise<GetAwardsSummaryResponse> {
    return { data: await this.awards.summary(query) };
  }

  /** Synchronous and bounded (`MAX_AWARD_PAGES` per slice), so 200 with the report. */
  @Post('fetch')
  @HttpCode(200)
  async fetch(
    @Body(new ZodValidationPipe(fetchAwardsRequestSchema)) body: FetchAwardsBody,
  ): Promise<FetchAwardsResponse> {
    return { data: await this.awards.fetch(body) };
  }
}
