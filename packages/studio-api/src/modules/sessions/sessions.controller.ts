import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  DEFAULT_LIST_LIMIT,
  type GetRevisionResponse,
  type GetSessionResponse,
  type ListRevisionsResponse,
  type ListSessionsResponse,
} from '@sysdesign/contracts';

import { ok, page } from '../../common/envelope';
import { toRevisionDto, toRevisionSummaryDto } from '../evaluations/evaluations.mapper';
import { CreateSessionRequestDto } from './dto/create-session.dto';
import { ListRevisionsQueryDto } from './dto/list-revisions-query.dto';
import { ListSessionsQueryDto } from './dto/list-sessions-query.dto';
import { SubmitRevisionRequestDto } from './dto/submit-revision.dto';
import { UpdateSessionRequestDto } from './dto/update-session.dto';
import { toSessionDto } from './sessions.mapper';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** 201 by Nest's POST default. */
  @Post()
  async create(@Body() dto: CreateSessionRequestDto): Promise<GetSessionResponse> {
    const session = await this.sessions.create(dto.promptId);
    return ok(toSessionDto({ session, latestRevision: null, latestEvaluation: null }));
  }

  @Get()
  async list(@Query() query: ListSessionsQueryDto): Promise<ListSessionsResponse> {
    const [items, total] = await this.sessions.list(query);
    return page(items.map(toSessionDto), {
      total,
      limit: query.limit ?? DEFAULT_LIST_LIMIT,
      offset: query.offset ?? 0,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetSessionResponse> {
    return ok(toSessionDto(await this.sessions.findOne(id)));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionRequestDto,
  ): Promise<GetSessionResponse> {
    return ok(toSessionDto(await this.sessions.updateStatus(id, dto.status)));
  }

  /** 201 with the embedded just-queued evaluation. */
  @Post(':id/revisions')
  async submitRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitRevisionRequestDto,
  ): Promise<GetRevisionResponse> {
    const { revision, evaluation } = await this.sessions.submitRevision(id, dto);
    return ok(toRevisionDto(revision, evaluation));
  }

  @Get(':id/revisions')
  async listRevisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListRevisionsQueryDto,
  ): Promise<ListRevisionsResponse> {
    const [items, total] = await this.sessions.listRevisions(id, query);
    return page(
      items.map(({ revision, evaluation }) => toRevisionSummaryDto(revision, evaluation)),
      { total, limit: query.limit ?? DEFAULT_LIST_LIMIT, offset: query.offset ?? 0 },
    );
  }
}
