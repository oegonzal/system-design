import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  DEFAULT_LIST_LIMIT,
  type GetExperienceResponse,
  type ListExperiencesResponse,
} from '@sysdesign/contracts';

import { ok, page } from '../../common/envelope';
import { toExperienceProfileDto } from './experiences.mapper';
import { ExperiencesService } from './experiences.service';

@Controller('experiences')
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

  @Get()
  async list(): Promise<ListExperiencesResponse> {
    const [items, total] = await this.experiences.list();
    return page(items.map(toExperienceProfileDto), {
      total,
      limit: DEFAULT_LIST_LIMIT,
      offset: 0,
    });
  }

  /** ParseUUIDPipe turns a malformed id into a 400 before we query for nothing. */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetExperienceResponse> {
    return ok(toExperienceProfileDto(await this.experiences.findOne(id)));
  }
}
