import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignRevision } from '@sysdesign/db';

import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [MikroOrmModule.forFeature([DesignRevision])],
  controllers: [ProgressController],
  providers: [ProgressService],
  // Prompts ask which competency to practise next when a generation names no format.
  exports: [ProgressService],
})
export class ProgressModule {}
