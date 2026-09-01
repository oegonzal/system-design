import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignRevision, DesignSession, EvalJob, Evaluation, Prompt } from '@sysdesign/db';

import { LlmModule } from '../llm/llm.module';
import { EvalQueue, PostgresEvalQueue } from './eval-queue';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([DesignSession, DesignRevision, Evaluation, EvalJob, Prompt]),
    LlmModule,
  ],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    // The BullMQ swap seam: change useClass, nothing else moves.
    { provide: EvalQueue, useClass: PostgresEvalQueue },
  ],
})
export class SessionsModule {}
