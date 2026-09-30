import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconEntity } from '@sysdesign/db';

import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { MikroOrmEntityRepository } from './persistence/mikro-orm-entity-repository';
import { ENTITY_REPOSITORY } from './tokens';

/** Registrants: the store, the lookup, the profile's own. */
@Module({
  imports: [MikroOrmModule.forFeature([GovconEntity]), SourcesModule, ProfilesModule],
  controllers: [EntitiesController],
  providers: [EntitiesService, { provide: ENTITY_REPOSITORY, useClass: MikroOrmEntityRepository }],
  exports: [EntitiesService],
})
export class EntitiesModule {}
