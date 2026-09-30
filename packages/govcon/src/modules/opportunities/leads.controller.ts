import { Controller, Get, Query } from '@nestjs/common';
import type { ListLeadsResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

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
    const { profile, tier, ...options } = query;
    return { data: await this.opportunities.leads(profile, { ...options, tier: tier ?? null }) };
  }
}
