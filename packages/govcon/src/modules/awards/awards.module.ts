import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconAward } from '@sysdesign/db';

import { SourcesModule } from '../sources/sources.module';
import { AwardsController } from './awards.controller';
import { AwardsService } from './awards.service';
import { MikroOrmAwardRepository } from './persistence/mikro-orm-award-repository';
import { AWARD_REPOSITORY } from './tokens';

/** Awards as intel: the store, the summary, the two fetches. */
@Module({
  imports: [MikroOrmModule.forFeature([GovconAward]), SourcesModule],
  controllers: [AwardsController],
  providers: [AwardsService, { provide: AWARD_REPOSITORY, useClass: MikroOrmAwardRepository }],
  exports: [AwardsService, AWARD_REPOSITORY],
})
export class AwardsModule {}
