import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  GetAgenciesResponse,
  GetAgencyOutlookResponse,
  GetAwardDetailResponse,
  GetNoticeIncumbentsResponse,
  GetSpendingPrimesResponse,
  GetSpendingBreakdownResponse,
  GetSpendingHorizonResponse,
  GetSpendingPulseResponse,
  GetSpendingReachResponse,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import {
  agencyOutlookQuerySchema,
  awardIdSchema,
  breakdownQuerySchema,
  horizonQuerySchema,
  incumbentsQuerySchema,
  primesQuerySchema,
  pulseQuerySchema,
  reachQuerySchema,
  toptierCodeSchema,
  type AgencyOutlookQueryInput,
  type BreakdownQueryInput,
  type HorizonQueryInput,
  type IncumbentsQueryInput,
  type PrimesQueryInput,
  type PulseQueryInput,
  type ReachQueryInput,
} from './spending-requests';
import { SpendingService } from './spending.service';

/** The spending lenses and the agency directory — reads, each answered from the day's snapshot or fetched free. */
@Controller('spending')
export class SpendingController {
  constructor(private readonly spending: SpendingService) {}

  @Get('pulse')
  async pulse(
    @Query(new ZodValidationPipe(pulseQuerySchema)) query: PulseQueryInput,
  ): Promise<GetSpendingPulseResponse> {
    return { data: await this.spending.pulse(query) };
  }

  @Get('breakdown')
  async breakdown(
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQueryInput,
  ): Promise<GetSpendingBreakdownResponse> {
    return { data: await this.spending.breakdown(query) };
  }

  @Get('reach')
  async reach(
    @Query(new ZodValidationPipe(reachQuerySchema)) query: ReachQueryInput,
  ): Promise<GetSpendingReachResponse> {
    return { data: await this.spending.reach(query) };
  }

  @Get('primes')
  async primes(
    @Query(new ZodValidationPipe(primesQuerySchema)) query: PrimesQueryInput,
  ): Promise<GetSpendingPrimesResponse> {
    return { data: await this.spending.primes(query) };
  }

  @Get('awards/:externalId')
  async award(
    @Param('externalId', new ZodValidationPipe(awardIdSchema)) externalId: string,
  ): Promise<GetAwardDetailResponse> {
    return { data: await this.spending.award(externalId) };
  }

  /** Who may hold the work one stored notice is about. */
  @Get('incumbents/:noticeId')
  async incumbents(
    @Param('noticeId') noticeId: string,
    @Query(new ZodValidationPipe(incumbentsQuerySchema)) query: IncumbentsQueryInput,
  ): Promise<GetNoticeIncumbentsResponse> {
    return { data: await this.spending.incumbents(noticeId, query) };
  }

  @Get('horizon')
  async horizon(
    @Query(new ZodValidationPipe(horizonQuerySchema)) query: HorizonQueryInput,
  ): Promise<GetSpendingHorizonResponse> {
    return { data: await this.spending.horizon(query) };
  }

  @Get('agencies')
  async agencies(): Promise<GetAgenciesResponse> {
    return { data: await this.spending.agencies() };
  }

  @Get('agencies/:toptierCode')
  async agency(
    @Param('toptierCode', new ZodValidationPipe(toptierCodeSchema)) toptierCode: string,
    @Query(new ZodValidationPipe(agencyOutlookQuerySchema)) query: AgencyOutlookQueryInput,
  ): Promise<GetAgencyOutlookResponse> {
    return { data: await this.spending.agency(toptierCode, query) };
  }
}
