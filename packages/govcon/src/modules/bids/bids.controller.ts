import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import type {
  GetBidPipelineSummaryResponse,
  ListPipelineResponse,
  SaveBidResponse,
} from '@sysdesign/contracts';
import { page, ZodValidationPipe } from '@sysdesign/nest-kit';

import { BidsService } from './bids.service';
import {
  listPipelineQuerySchema,
  saveBidRequestSchema,
  type ListPipelineQueryInput,
  type SaveBidBody,
} from './save-bid-request';

/** A notice's bid: one row, put or deleted. */
@Controller('notices')
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  @Put(':noticeId/bid')
  async save(
    @Param('noticeId') noticeId: string,
    @Body(new ZodValidationPipe(saveBidRequestSchema)) body: SaveBidBody,
  ): Promise<SaveBidResponse> {
    return { data: await this.bids.save(noticeId, body) };
  }

  @Delete(':noticeId/bid')
  @HttpCode(204)
  async remove(@Param('noticeId') noticeId: string): Promise<void> {
    await this.bids.remove(noticeId);
  }
}

/** The pipeline: every tracked notice scored, and the counts. */
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly bids: BidsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listPipelineQuerySchema)) query: ListPipelineQueryInput,
  ): Promise<ListPipelineResponse> {
    const [data, total] = await this.bids.pipeline(query.profile, {
      stage: query.stage ?? null,
      limit: query.limit,
      offset: query.offset,
    });
    return page(data, total, query);
  }

  @Get('summary')
  async summary(): Promise<GetBidPipelineSummaryResponse> {
    return { data: await this.bids.summary() };
  }
}
