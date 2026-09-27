import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { FetchDescriptionResponse, GetLeadResponse } from '@sysdesign/contracts';

import { ZodValidationPipe } from '../app/zod.pipe';
import { OpportunitiesService } from './opportunities.service';
import { profileQuerySchema, type ProfileQuery } from './profile-query';

/** One stored notice: its lead with the factor trace, and its description on demand. */
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get(':noticeId')
  async get(
    @Param('noticeId') noticeId: string,
    @Query(new ZodValidationPipe(profileQuerySchema)) query: ProfileQuery,
  ): Promise<GetLeadResponse> {
    const lead = await this.opportunities.show(noticeId, query.profile);
    if (!lead) throw new NotFoundException(`no stored notice ${noticeId}`);
    return { data: lead };
  }

  /** One budgeted request the first time; the stored text afterwards. Synchronous, so 200. */
  @Post(':noticeId/description')
  @HttpCode(200)
  async describe(@Param('noticeId') noticeId: string): Promise<FetchDescriptionResponse> {
    return { data: await this.opportunities.describe(noticeId) };
  }
}
