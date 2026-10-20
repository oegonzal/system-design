import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type {
  AnswerInterviewResponse,
  AnswerRequest,
  ClarifyRequest,
  GetInterviewResponse,
  StartInterviewTurnResponse,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { ok } from '../../common/envelope';
import { answerSchema, clarifySchema } from './interview-requests';
import { InterviewService } from './interview.service';

@Controller('sessions/:id/interview')
export class InterviewController {
  constructor(private readonly interview: InterviewService) {}

  /** The interview so far; a reply whose run has finished is claimed by this read, once. */
  @Get()
  async state(@Param('id', ParseUUIDPipe) id: string): Promise<GetInterviewResponse> {
    return ok(await this.interview.state(id));
  }

  /** 202: the interviewer answers through a run; poll `GET …/interview`. */
  @Post('clarify')
  @HttpCode(202)
  async clarify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(clarifySchema)) body: ClarifyRequest,
  ): Promise<StartInterviewTurnResponse> {
    return ok(await this.interview.clarify(id, body));
  }

  /** 202: the deep dive opens with the interviewer's probes, chosen without a model. */
  @Post('probe')
  @HttpCode(202)
  async probe(@Param('id', ParseUUIDPipe) id: string): Promise<StartInterviewTurnResponse> {
    return ok(await this.interview.probe(id));
  }

  /** 201 by Nest's POST default: the candidate's answer, stored as a turn. */
  @Post('answer')
  async answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(answerSchema)) body: AnswerRequest,
  ): Promise<AnswerInterviewResponse> {
    return ok(await this.interview.answer(id, body));
  }

  /** The author moves on; the clock advances where the current phase declares it. */
  @Post('advance')
  @HttpCode(200)
  async advance(@Param('id', ParseUUIDPipe) id: string): Promise<GetInterviewResponse> {
    return ok(await this.interview.advance(id));
  }
}
