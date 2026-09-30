import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignRevision, DesignSession, Prompt } from '@sysdesign/db';

import { PromptsModule } from '../prompts/prompts.module';
import { EvaluationsService } from './evaluations.service';
import { ImproveService } from './improve.service';
import { RevisionsController } from './revisions.controller';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [MikroOrmModule.forFeature([DesignSession, DesignRevision, Prompt]), PromptsModule],
  controllers: [SessionsController, RevisionsController],
  providers: [SessionsService, EvaluationsService, ImproveService],
})
export class SessionsModule {}
