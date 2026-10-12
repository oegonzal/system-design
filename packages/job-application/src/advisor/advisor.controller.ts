import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ADVISOR_ROUTES,
  unitAdviceRequestSchema,
  type AdvisorDescriptor,
  type UnitAdvice,
  type UnitAdviceRequest,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { RECORD_SOURCE, type RecordSource } from './ports';

/**
 * The advisor protocol, as any tenant answers it: who this advisor is and
 * which declared facts it keeps its record by, and the units on record for
 * a subject. Nothing here knows what the record is of.
 */
@Controller()
export class AdvisorController {
  constructor(@Inject(RECORD_SOURCE) private readonly source: RecordSource) {}

  @Get(ADVISOR_ROUTES.describe)
  describe(): { data: AdvisorDescriptor } {
    return { data: this.source.describe() };
  }

  @Post(ADVISOR_ROUTES.advice)
  @HttpCode(200)
  async advice(
    @Body(new ZodValidationPipe(unitAdviceRequestSchema)) body: UnitAdviceRequest,
  ): Promise<{ data: UnitAdvice }> {
    // An asker that does not compare on the facts this record is kept by would read its identities as nothing.
    const missing = this.source.describe().facets.filter((facet) => !body.facets.includes(facet));
    if (missing.length > 0) {
      throw new BadRequestException({
        message: `this advisor keeps its record by ${missing.join(', ')}, which the request does not compare on`,
      });
    }
    return { data: await this.source.unitsOnRecord(body) };
  }
}
