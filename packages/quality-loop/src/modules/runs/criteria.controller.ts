import { Body, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import type {
  DeriveCriteriaRequest,
  DeriveCriteriaResponse,
  Diagnostic,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { criteriaRequestSchema } from './criteria-request';
import { RunsService } from './runs.service';

/**
 * Why a derivation came back empty, in its diagnostic's words — the model's
 * own error where the call failed. Measured 2026-10-11: a call the provider
 * refused (`oauth_org_not_allowed`) reached a session as "the model derived no
 * criteria", when the model was never reached.
 */
const emptyDerivation = (diagnostic: Diagnostic | null): string =>
  diagnostic === null
    ? 'the model derived no criteria'
    : `no criteria were derived — ${diagnostic.reason}${diagnostic.detail === null ? '' : `: ${diagnostic.detail}`}`;

/**
 * The derive-criteria stage alone: one model call and no run, dumped as a
 * folder of its own (`dumpRunId`). A caller that stores a rubric once (and
 * cites its ids across runs) gets it here. A derivation the model fails is 503
 * with the diagnostic, its message saying what the diagnostic says — never an
 * empty list a run could be started against.
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
        message: emptyDerivation(derived.diagnostic),
        llm: derived.llm,
        diagnostic: derived.diagnostic,
      });
    }
    return { data: derived };
  }
}
