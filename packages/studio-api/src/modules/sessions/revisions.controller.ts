import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { GetEvaluationResponse, GetRevisionResponse } from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { ok } from '../../common/envelope';
import { EvaluationsService } from './evaluations.service';
import { toRevisionDto } from './sessions.mapper';

/** A revision by id — the design as stored — and its grade, read from the loop. */
@Controller('revisions')
export class RevisionsController {
  constructor(
    private readonly em: EntityManager,
    private readonly evaluations: EvaluationsService,
  ) {}

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetRevisionResponse> {
    const revision = await this.em.findOne(DesignRevision, id);
    if (!revision) throw new NotFoundException(`Revision ${id} not found`);
    return ok(toRevisionDto(revision));
  }

  @Get(':id/evaluation')
  async evaluation(@Param('id', ParseUUIDPipe) id: string): Promise<GetEvaluationResponse> {
    return ok(await this.evaluations.forRevision(id));
  }
}
