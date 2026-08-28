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
import {
  DEFAULT_LIST_LIMIT,
  type GetStarStoryResponse,
  type ListStarStoriesResponse,
} from '@sysdesign/contracts';

import { ok, page } from '../../common/envelope';
import { ListStarStoriesQueryDto } from './dto/list-star-stories-query.dto';
import { SaveStarStoryRequestDto } from './dto/save-star-story.dto';
import { toStarStoryDto } from './star-stories.mapper';
import { StarStoriesService } from './star-stories.service';

@Controller('star-stories')
export class StarStoriesController {
  constructor(private readonly stories: StarStoriesService) {}

  @Post()
  async create(@Body() dto: SaveStarStoryRequestDto): Promise<GetStarStoryResponse> {
    return ok(toStarStoryDto(await this.stories.create(dto)));
  }

  @Get()
  async list(@Query() query: ListStarStoriesQueryDto): Promise<ListStarStoriesResponse> {
    const [items, total] = await this.stories.list(query);
    return page(items.map(toStarStoryDto), {
      total,
      limit: query.limit ?? DEFAULT_LIST_LIMIT,
      offset: query.offset ?? 0,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetStarStoryResponse> {
    return ok(toStarStoryDto(await this.stories.findOne(id)));
  }

  /** Full replace — same DTO as create, idempotent, which is why it is PUT. */
  @Put(':id')
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveStarStoryRequestDto,
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
