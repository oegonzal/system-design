import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconSavedSearch, GovconSearchProfile } from '@sysdesign/db';

import { SourcesModule } from '../sources/sources.module';
import { MikroOrmProfileRepository } from './persistence/mikro-orm-profile-repository';
import { MikroOrmSavedSearchRepository } from './persistence/mikro-orm-saved-search-repository';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { SearchesController } from './searches.controller';
import { SearchesService } from './searches.service';
import { PROFILE_REPOSITORY, SAVED_SEARCH_REPOSITORY } from './tokens';

/** Profiles and their saved searches — one concern: what a company looks for. */
@Module({
  imports: [MikroOrmModule.forFeature([GovconSearchProfile, GovconSavedSearch]), SourcesModule],
  controllers: [ProfilesController, SearchesController],
  providers: [
    ProfilesService,
    SearchesService,
    { provide: PROFILE_REPOSITORY, useClass: MikroOrmProfileRepository },
    { provide: SAVED_SEARCH_REPOSITORY, useClass: MikroOrmSavedSearchRepository },
  ],
  exports: [ProfilesService, SearchesService, PROFILE_REPOSITORY, SAVED_SEARCH_REPOSITORY],
})
export class ProfilesModule {}
