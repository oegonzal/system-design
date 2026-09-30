import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  GetStarStoryResponse,
  ListStarStoriesResponse,
  SaveStarStoryRequest,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { ok, page } from '../../common/envelope';
import {
  listStarStoriesQuerySchema,
  saveStarStorySchema,
  type ListStarStoriesQueryInput,
} from './star-story-requests';
import { toStarStoryDto } from './star-stories.mapper';
import { StarStoriesService } from './star-stories.service';

@Controller('star-stories')
export class StarStoriesController {
  constructor(private readonly stories: StarStoriesService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(saveStarStorySchema)) dto: SaveStarStoryRequest,
  ): Promise<GetStarStoryResponse> {
    return ok(toStarStoryDto(await this.stories.create(dto)));
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listStarStoriesQuerySchema)) query: ListStarStoriesQueryInput,
  ): Promise<ListStarStoriesResponse> {
    const [items, total] = await this.stories.list(query);
    return page(items.map(toStarStoryDto), { total, limit: query.limit, offset: query.offset });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetStarStoryResponse> {
    return ok(toStarStoryDto(await this.stories.findOne(id)));
  }

  /** Full replace — same DTO as create, idempotent, which is why it is PUT. */
  @Put(':id')
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveStarStorySchema)) dto: SaveStarStoryRequest,
  ): Promise<GetStarStoryResponse> {
    return ok(toStarStoryDto(await this.stories.replace(id, dto)));
  }

  /** 204: nothing meaningful to return once it is gone. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.stories.remove(id);
  }
}
