import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconSavedView } from '@sysdesign/db';

import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { MikroOrmSavedViewRepository } from './persistence/mikro-orm-saved-view-repository';
import { SAVED_VIEW_REPOSITORY } from './tokens';
import { ProfileViewsController, ViewsController } from './views.controller';
import { ViewsService } from './views.service';

/** Saved views — one concern: the pages a profile keeps by name. */
@Module({
  imports: [MikroOrmModule.forFeature([GovconSavedView]), ProfilesModule, SourcesModule],
  controllers: [ProfileViewsController, ViewsController],
  providers: [
    ViewsService,
    { provide: SAVED_VIEW_REPOSITORY, useClass: MikroOrmSavedViewRepository },
  ],
})
export class ViewsModule {}
