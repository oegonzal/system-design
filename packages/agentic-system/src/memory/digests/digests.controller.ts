import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  registerDigestRequestSchema,
  type ApiResponse,
  type AppliedDigestDto,
  type DigestDto,
  type OrchestrationRunStartedDto,
  type RegisterDigestRequest,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { answered } from '../refusals';
import { DigestsService } from './digests.service';

/**
 * A memory space's digests over HTTP: a text handed in to be digested on the
 * loop — 202 with the orchestration, which runs for minutes and is polled —
 * the digest read back, and its endorsed memories remembered once. A refusal
 * answers its one declared status (`refusals.ts`), and a body the contract
 * does not accept is the pipe's 400.
 */
@Controller('spaces')
export class DigestsController {
  constructor(private readonly digests: DigestsService) {}

  @Post(':id/digests')
  @HttpCode(202)
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(registerDigestRequestSchema)) body: RegisterDigestRequest,
  ): Promise<ApiResponse<OrchestrationRunStartedDto>> {
    return { data: await answered(() => this.digests.start(id, body)) };
  }

  @Get(':id/digests/:runId')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<ApiResponse<DigestDto>> {
    return { data: await answered(() => this.digests.get(id, runId)) };
  }

  /** 200 with what each endorsed memory's write did; nothing is read from the body. */
  @Post(':id/digests/:runId/remember')
  @HttpCode(200)
  async remember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<ApiResponse<AppliedDigestDto>> {
    return { data: await answered(() => this.digests.remember(id, runId)) };
  }
}
