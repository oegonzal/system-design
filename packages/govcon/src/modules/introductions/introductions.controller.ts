import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { GetIntroductionResponse, StartIntroductionResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { targetKeySchema, type TargetKeyInput } from '../targets/target-requests';
import { startIntroductionSchema, type StartIntroductionBody } from './introduction-requests';
import { IntroductionsService } from './introductions.service';

/** An introduction drafted for a tracked firm or award: started as one run, read back by its id. */
@Controller('introductions')
export class IntroductionsController {
  constructor(private readonly introductions: IntroductionsService) {}

  @Post()
  @HttpCode(202)
  async start(
    @Body(new ZodValidationPipe(startIntroductionSchema)) body: StartIntroductionBody,
  ): Promise<StartIntroductionResponse> {
    return { data: await this.introductions.start(body) };
  }

  @Get(':runId')
  async read(
    @Param('runId') runId: string,
    @Query(new ZodValidationPipe(targetKeySchema)) key: TargetKeyInput,
  ): Promise<GetIntroductionResponse> {
    return { data: await this.introductions.read(runId, key) };
  }
}
