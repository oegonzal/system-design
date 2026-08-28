import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type {
  GetEvaluationResponse,
  GetRevisionResponse,
  RetryEvaluationResponse,
} from '@sysdesign/contracts';

import { ok } from '../../common/envelope';
import { toEvaluationDto, toRevisionDto } from './evaluations.mapper';
import { EvaluationsService } from './evaluations.service';

/** Revision-scoped reads plus the retry escape hatch. */
@Controller('revisions')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  /** One GET answers "what did I submit and how did it do". */
  @Get(':id')
  async findRevision(@Param('id', ParseUUIDPipe) id: string): Promise<GetRevisionResponse> {
    const { revision, evaluation } = await this.evaluations.findRevision(id);
    return ok(toRevisionDto(revision, evaluation));
  }

  @Get(':id/evaluation')
  async findEvaluation(@Param('id', ParseUUIDPipe) id: string): Promise<GetEvaluationResponse> {
    return ok(toEvaluationDto(await this.evaluations.findEvaluation(id)));
  }

  /** 202: accepted for re-processing — the worker completes it later. */
  @Post(':id/evaluation/retry')
  @HttpCode(202)
  async retry(@Param('id', ParseUUIDPipe) id: string): Promise<RetryEvaluationResponse> {
    return ok(toEvaluationDto(await this.evaluations.retry(id)));
  }
}
