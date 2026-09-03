import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  DEFAULT_LIST_LIMIT,
  type GetPromptResponse,
  type ListPromptsResponse,
} from '@sysdesign/contracts';

import { ok, page } from '../../common/envelope';
import { AuthorPromptRequestDto } from './dto/author-prompt.dto';
import { GeneratePromptRequestDto } from './dto/generate-prompt.dto';
import { ListPromptsQueryDto } from './dto/list-prompts-query.dto';
import { UpdatePromptRequestDto } from './dto/update-prompt.dto';
import { toPromptDto } from './prompts.mapper';
import { PromptsService } from './prompts.service';

@Controller('prompts')
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  /**
   * Declared before the ':id' routes so the literal path wins route matching.
   * 201 by Nest's POST default — a prompt row is created.
   */
  @Post('generate')
  async generate(@Body() dto: GeneratePromptRequestDto): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.generate(dto.experienceId, dto.difficulty, dto.seed)));
  }

  /**
   * A prompt authored from an assessment's own requirements, verbatim —
   * validated against the same vocabularies and spec closure the generator
   * honors, then graded like any other. 201: a prompt row is created.
   */
  @Post()
  async author(@Body() dto: AuthorPromptRequestDto): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.author(dto)));
  }

  /** New prompt from the same experience + difficulty with a fresh seed. */
  @Post(':id/regenerate')
  async regenerate(@Param('id', ParseUUIDPipe) id: string): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.regenerate(id)));
  }

  @Get()
  async list(@Query() query: ListPromptsQueryDto): Promise<ListPromptsResponse> {
    const [items, total] = await this.prompts.list(query);
    return page(items.map(toPromptDto), {
      total,
      limit: query.limit ?? DEFAULT_LIST_LIMIT,
      offset: query.offset ?? 0,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.findOne(id)));
  }

  /** Archive / reactivate. */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromptRequestDto,
  ): Promise<GetPromptResponse> {
    return ok(toPromptDto(await this.prompts.updateStatus(id, dto.status)));
  }
}
