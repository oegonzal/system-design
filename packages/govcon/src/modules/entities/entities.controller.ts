import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { GetEntityResponse, LookupEntitiesResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { EntitiesService } from './entities.service';
import {
  lookupEntitiesRequestSchema,
  ownQuerySchema,
  ueiParamSchema,
  type LookupEntitiesBody,
  type OwnQuery,
} from './entity-requests';

/** Registrants: the profile's own, one by UEI from the store, and the lookup that spends. */
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @Get('own')
  async own(
    @Query(new ZodValidationPipe(ownQuerySchema)) query: OwnQuery,
  ): Promise<GetEntityResponse> {
    return { data: await this.entities.own(query.profile) };
  }

  /** Synchronous — at most one batch — so 200 with the answer. */
  @Post('lookup')
  @HttpCode(200)
  async lookup(
    @Body(new ZodValidationPipe(lookupEntitiesRequestSchema)) body: LookupEntitiesBody,
  ): Promise<LookupEntitiesResponse> {
    return { data: await this.entities.lookup(body.ueis) };
  }

  @Get(':uei')
  async get(
    @Param(new ZodValidationPipe(ueiParamSchema)) params: { uei: string },
  ): Promise<GetEntityResponse> {
    return { data: await this.entities.get(params.uei) };
  }
}
