import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type {
  GetEvaluationResponse,
  GetRevisionResponse,
  RegradeRevisionResponse,
} from '@sysdesign/contracts';
import { DesignRevision } from '@sysdesign/db';

import { ok } from '../../common/envelope';
import { notFound } from '../../common/not-found';
import { EvaluationsService } from './evaluations.service';
import { toRevisionDto } from './sessions.mapper';
import { SessionsService } from './sessions.service';

/** A revision by id — the design as stored — and its grade, read from the loop or run again. */
@Controller('revisions')
export class RevisionsController {
  constructor(
    private readonly em: EntityManager,
    private readonly evaluations: EvaluationsService,
    private readonly sessions: SessionsService,
  ) {}

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetRevisionResponse> {
    const revision = await this.em.findOne(DesignRevision, id);
    if (!revision) throw notFound('revision', `Revision ${id} not found`);
    return ok(toRevisionDto(revision));
  }

  @Get(':id/evaluation')
  async evaluation(@Param('id', ParseUUIDPipe) id: string): Promise<GetEvaluationResponse> {
    return ok(await this.evaluations.forRevision(id));
  }

  /**
   * 202: the stored revision is being graded again, in place — the same
   * revision, pointing at a fresh run; poll `GET :id/evaluation`. Only for a
   * revision whose grade failed or cannot be read; 409 for one that stands.
   */
  @Post(':id/evaluation')
  @HttpCode(202)
  async regrade(@Param('id', ParseUUIDPipe) id: string): Promise<RegradeRevisionResponse> {
    return ok(toRevisionDto(await this.sessions.regradeRevision(id)));
  }
}
