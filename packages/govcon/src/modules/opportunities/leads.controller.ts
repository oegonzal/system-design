import { Controller, Get, Query } from '@nestjs/common';
import type { ListLeadsResponse } from '@sysdesign/contracts';

import { ZodValidationPipe } from '../app/zod.pipe';
import { listLeadsQuerySchema, type ListLeadsQueryInput } from './list-leads-query';
import { OpportunitiesService } from './opportunities.service';

/** Ranked from the store; never a request upstream. */
@Controller('leads')
export class LeadsController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: ListLeadsQueryInput,
  ): Promise<ListLeadsResponse> {
    const report = await this.opportunities.leads(query.profile, {
      minScore: query.minScore,
      tier: query.tier ?? null,
      limit: query.limit,
    });
    return { data: report };
  }
}
