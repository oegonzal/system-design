import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  CreateSessionRequest,
  GetImproveRunResponse,
  GetRevisionResponse,
  GetSessionDraftResponse,
  GetSessionResponse,
  ListCoachingRunsResponse,
  PutSessionDraftRequest,
  ListRevisionsResponse,
  ListSessionsResponse,
  StartImproveRequest,
  StartImproveResponse,
  SubmitRevisionRequest,
  UpdateSessionRequest,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { ok, page } from '../../common/envelope';
import { ImproveService } from './improve.service';
import {
  createSessionSchema,
  listRevisionsQuerySchema,
  listSessionsQuerySchema,
  putSessionDraftSchema,
  startImproveSchema,
  submitRevisionSchema,
  updateSessionSchema,
  type ListRevisionsQueryInput,
  type ListSessionsQueryInput,
} from './session-requests';
import { toRevisionDto, toRevisionSummaryDto, toSessionDto } from './sessions.mapper';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly improve: ImproveService,
  ) {}

  /** 201 by Nest's POST default. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createSessionSchema)) body: CreateSessionRequest,
  ): Promise<GetSessionResponse> {
    const session = await this.sessions.create(body.promptId);
    return ok(toSessionDto({ session, latestRevision: null }));
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listSessionsQuerySchema)) query: ListSessionsQueryInput,
  ): Promise<ListSessionsResponse> {
    const [items, total] = await this.sessions.list(query);
    return page(items.map(toSessionDto), { total, limit: query.limit, offset: query.offset });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetSessionResponse> {
    return ok(toSessionDto(await this.sessions.findOne(id)));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSessionSchema)) body: UpdateSessionRequest,
  ): Promise<GetSessionResponse> {
    return ok(toSessionDto(await this.sessions.updateStatus(id, body.status)));
  }

  @Get(':id/draft')
  async getDraft(@Param('id', ParseUUIDPipe) id: string): Promise<GetSessionDraftResponse> {
    return ok(await this.sessions.getDraft(id));
  }

  /** 204: the unsubmitted canvas, kept with the session until it is submitted. */
  @Put(':id/draft')
  @HttpCode(204)
  async saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(putSessionDraftSchema)) body: PutSessionDraftRequest,
  ): Promise<void> {
    await this.sessions.saveDraft(id, body);
  }

  /** 201 with the revision; its grade is running — poll `GET /revisions/:id/evaluation`. */
  @Post(':id/revisions')
  async submitRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitRevisionSchema)) body: SubmitRevisionRequest,
  ): Promise<GetRevisionResponse> {
    return ok(toRevisionDto(await this.sessions.submitRevision(id, body)));
  }

  @Get(':id/revisions')
  async listRevisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listRevisionsQuerySchema)) query: ListRevisionsQueryInput,
  ): Promise<ListRevisionsResponse> {
    const [items, total] = await this.sessions.listRevisions(id, query);
    return page(items.map(toRevisionSummaryDto), {
      total,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /** 202: the draft is stored as a revision and the coach is running; poll the run. */
  @Post(':id/improve')
  @HttpCode(202)
  async startImprove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(startImproveSchema)) body: StartImproveRequest,
  ): Promise<StartImproveResponse> {
    return ok(await this.improve.start(id, body));
  }

  /** Reading the run imports every iteration that beat the ones before it, once. */
  /** Every coaching run of the session, newest first — what a reloaded workspace resumes polling. */
  @Get(':id/improve')
  async listImprove(@Param('id', ParseUUIDPipe) id: string): Promise<ListCoachingRunsResponse> {
    return ok(await this.improve.list(id));
  }

  @Get(':id/improve/:runId')
  async getImprove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('runId') runId: string,
  ): Promise<GetImproveRunResponse> {
    return ok(await this.improve.get(id, runId));
  }
}
