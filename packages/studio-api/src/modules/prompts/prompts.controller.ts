import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AuthorPromptRequest,
  GeneratePromptRequest,
  GetPromptGenerationResponse,
  GetPromptLibraryDocumentResponse,
  GetPromptResponse,
  ImportPromptRequest,
  ListPromptLibraryResponse,
  ListPromptsResponse,
  StartPromptGenerationResponse,
  UpdatePromptRequest,
} from '@sysdesign/contracts';
import { page, ZodValidationPipe } from '@sysdesign/nest-kit';

import { ok } from '../../common/envelope';
import {
  authorPromptSchema,
  generatePromptSchema,
  importPromptSchema,
  listPromptsQuerySchema,
  updatePromptSchema,
  type ListPromptsQueryInput,
} from './prompt-requests';
import { toPromptDto } from './prompts.mapper';
import { PromptGenerationService } from './prompt-generation.service';
import { PromptsService } from './prompts.service';

/** Literal paths are declared before `:id` so they win route matching. */
@Controller('prompts')
export class PromptsController {
  constructor(
    private readonly prompts: PromptsService,
    private readonly generations: PromptGenerationService,
  ) {}

  /** The quality loop's library, proxied: what `POST /prompts/import` can copy. */
  @Get('library')
  async library(): Promise<ListPromptLibraryResponse> {
    return ok(await this.prompts.listLibrary());
  }

  /** A library id is a path; the wildcard keeps its segments (Express hands them back as an array). */
  @Get('library/*id')
  async libraryDocument(
    @Param('id') id: string | readonly string[],
  ): Promise<GetPromptLibraryDocumentResponse> {
    return ok(await this.prompts.libraryDocument(Array.isArray(id) ? id.join('/') : String(id)));
  }

  /** 202: the draft is written by a run; poll `GET /prompts/generate/:runId`. */
  @Post('generate')
  @HttpCode(202)
  async generate(
    @Body(new ZodValidationPipe(generatePromptSchema)) body: GeneratePromptRequest,
  ): Promise<StartPromptGenerationResponse> {
    return ok(await this.generations.start(body));
  }

  @Get('generate/:runId')
  async generation(@Param('runId') runId: string): Promise<GetPromptGenerationResponse> {
    return ok(await this.generations.read(runId));
  }

  /** 201: a prompt row is created from a library document. */
  @Post('import')
  async import(
    @Body(new ZodValidationPipe(importPromptSchema)) body: ImportPromptRequest,
  ): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.import(body)));
  }

  /** 201: a prompt row is created from the author's own markdown. */
  @Post()
  async author(
    @Body(new ZodValidationPipe(authorPromptSchema)) body: AuthorPromptRequest,
  ): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.author(body)));
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listPromptsQuerySchema)) query: ListPromptsQueryInput,
  ): Promise<ListPromptsResponse> {
    const [views, total] = await this.prompts.list(query);
    return page(views.map(toPromptDto), total, query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.findOne(id)));
  }

  /** Re-derive the rubric; 409 once the prompt is locked (`rubricLocked`). 200: the row already existed. */
  @Post(':id/criteria')
  @HttpCode(200)
  async rederive(@Param('id', ParseUUIDPipe) id: string): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.rederiveCriteria(id)));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePromptSchema)) body: UpdatePromptRequest,
  ): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.update(id, body)));
  }
}
