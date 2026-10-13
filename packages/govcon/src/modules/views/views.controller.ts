import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import type { ListSavedViewsResponse, SaveSavedViewResponse } from '@sysdesign/contracts';
import { ZodValidationPipe } from '@sysdesign/nest-kit';

import { saveViewSchema, type SaveViewBody } from './save-view-request';
import { ViewsService } from './views.service';

/** A profile's saved views: listed, and saved by name. */
@Controller('profiles/:profileId/views')
export class ProfileViewsController {
  constructor(private readonly views: ViewsService) {}

  @Get()
  async list(@Param('profileId') profileId: string): Promise<ListSavedViewsResponse> {
    return { data: await this.views.list(profileId) };
  }

  @Put()
  async save(
    @Param('profileId') profileId: string,
    @Body(new ZodValidationPipe(saveViewSchema)) body: SaveViewBody,
  ): Promise<SaveSavedViewResponse> {
    return { data: await this.views.save(profileId, body) };
  }
}

/** One saved view by id. */
@Controller('views')
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.views.remove(id);
  }
}
