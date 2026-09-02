import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignRevision, DesignSession, EvalJob, Evaluation, ImprovementRun } from '@sysdesign/db';

import { SessionsModule } from '../sessions/sessions.module';
import { ImprovementRunsController } from './improvement-runs.controller';
import { ImprovementRunsService } from './improvement-runs.service';
import { SessionImprovementController } from './session-improvement.controller';

@Module({
  imports: [
    MikroOrmModule.forFeature([ImprovementRun, DesignSession, DesignRevision, Evaluation, EvalJob]),
    // For the EvalQueue seam only: the base revision enqueues like any submit.
    SessionsModule,
  ],
  controllers: [ImprovementRunsController, SessionImprovementController],
  providers: [ImprovementRunsService],
})
export class ImprovementRunsModule {}
