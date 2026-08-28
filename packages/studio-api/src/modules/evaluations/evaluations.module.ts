import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignRevision, EvalJob, Evaluation, Finding } from '@sysdesign/db';

import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

@Module({
  imports: [MikroOrmModule.forFeature([DesignRevision, Evaluation, Finding, EvalJob])],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
})
export class EvaluationsModule {}
