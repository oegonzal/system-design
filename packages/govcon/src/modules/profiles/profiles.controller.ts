import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import type {
  GetProfileResponse,
  ListProfilesResponse,
  ListSavedSearchesResponse,
  SaveProfileResponse,
  SaveSavedSearchResponse,
} from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { ProfilesService } from './profiles.service';
import { saveSavedSearchSchema, type SaveSavedSearchBody } from './saved-search-request';
import { SearchesService } from './searches.service';

/**
 * Profiles as editable data. A document is validated by the service — the
 * whole profile schema, with issues per path — so the body passes through
 * unparsed; the service answers 400 with the issues and writes nothing.
 */
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly searches: SearchesService,
  ) {}

  @Get()
  async list(): Promise<ListProfilesResponse> {
    return { data: await this.profiles.list() };
  }

  @Post()
  async create(@Body() body: unknown): Promise<SaveProfileResponse> {
    return { data: await this.profiles.create(body) };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<GetProfileResponse> {
    return { data: await this.profiles.get(id) };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<SaveProfileResponse> {
    return { data: await this.profiles.update(id, body) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.profiles.remove(id);
  }

  @Post(':id/default')
  @HttpCode(200)
  async setDefault(@Param('id') id: string): Promise<GetProfileResponse> {
    return { data: await this.profiles.setDefault(id) };
  }

  @Get(':id/searches')
  async listSearches(@Param('id') id: string): Promise<ListSavedSearchesResponse> {
    return { data: await this.searches.list(id) };
  }

  @Post(':id/searches')
  async createSearch(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveSavedSearchSchema)) body: SaveSavedSearchBody,
  ): Promise<SaveSavedSearchResponse> {
    return { data: await this.searches.create(id, body) };
  }
}
