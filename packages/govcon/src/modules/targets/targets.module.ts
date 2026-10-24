import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { GovconTarget } from '@sysdesign/db';

import { SourcesModule } from '../sources/sources.module';
import { MikroOrmTargetRepository } from './persistence/mikro-orm-target-repository';
import { TargetsController } from './targets.controller';
import { TargetsService } from './targets.service';
import { TARGET_REPOSITORY } from './tokens';

/** Targets — one concern: the firms and awards the company pursues. The repository is exported for the daily warm, which reads the tracked awards. */
@Module({
  imports: [MikroOrmModule.forFeature([GovconTarget]), SourcesModule],
  controllers: [TargetsController],
  providers: [TargetsService, { provide: TARGET_REPOSITORY, useClass: MikroOrmTargetRepository }],
  exports: [TARGET_REPOSITORY, TargetsService],
})
export class TargetsModule {}
