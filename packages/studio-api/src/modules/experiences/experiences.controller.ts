import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { GetExperienceResponse, ListExperiencesResponse } from '@sysdesign/contracts';
import { page, ZodValidationPipe } from '@sysdesign/nest-kit';

import { ok } from '../../common/envelope';
import { listExperiencesQuerySchema, type ListExperiencesQueryInput } from './experience-requests';
import { toExperienceProfileDto } from './experiences.mapper';
import { ExperiencesService } from './experiences.service';

@Controller('experiences')
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listExperiencesQuerySchema)) query: ListExperiencesQueryInput,
  ): Promise<ListExperiencesResponse> {
    const [items, total] = await this.experiences.list(query);
    return page(items.map(toExperienceProfileDto), total, query);
  }

  /** ParseUUIDPipe turns a malformed id into a 400 before we query for nothing. */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GetExperienceResponse> {
    return ok(toExperienceProfileDto(await this.experiences.findOne(id)));
  }
}
