import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import type { SaveSavedSearchResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { saveSavedSearchSchema, type SaveSavedSearchBody } from './saved-search-request';
import { SearchesService } from './searches.service';

/** One saved search by id; running one lives with the pulls. */
@Controller('searches')
export class SearchesController {
  constructor(private readonly searches: SearchesService) {}

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveSavedSearchSchema)) body: SaveSavedSearchBody,
  ): Promise<SaveSavedSearchResponse> {
    return { data: await this.searches.update(id, body) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.searches.remove(id);
  }
}
