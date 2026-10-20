import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CoachingRun, DesignRevision, DesignSession, Prompt } from '@sysdesign/db';

import { PromptsModule } from '../prompts/prompts.module';
import { EvaluationsService } from './evaluations.service';
import { ImproveService } from './improve.service';
import { RevisionsController } from './revisions.controller';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([DesignSession, DesignRevision, CoachingRun, Prompt]),
    PromptsModule,
  ],
  controllers: [SessionsController, RevisionsController],
  providers: [SessionsService, EvaluationsService, ImproveService],
  // The interview module runs its turns under the session's own lock and rules.
  exports: [SessionsService],
})
export class SessionsModule {}
