import { Body, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import type { DeriveCriteriaRequest, DeriveCriteriaResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { criteriaRequestSchema } from './criteria-request';
import { RunsService } from './runs.service';

/**
 * The derive-criteria stage alone: one model call, no run, no dump. A caller
 * that stores a rubric once (and cites its ids across runs) gets it here. A
 * derivation the model fails is 503 with the diagnostic — never an empty
 * list a run could be started against.
 */
@Controller('criteria')
export class CriteriaController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  @HttpCode(200)
  async derive(
    @Body(new ZodValidationPipe(criteriaRequestSchema)) body: DeriveCriteriaRequest,
  ): Promise<DeriveCriteriaResponse> {
    const derived = await this.runs.deriveCriteria(body);
    if (derived.criteria.length === 0) {
      throw new ServiceUnavailableException({
        message: 'the model derived no criteria',
        llm: derived.llm,
        diagnostic: derived.diagnostic,
      });
    }
    return { data: derived };
  }
}
