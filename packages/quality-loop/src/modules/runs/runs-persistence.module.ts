import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  QualityRun,
  QualityRunCriterion,
  QualityRunCriterionResult,
  QualityRunFinding,
  QualityRunIteration,
} from '@sysdesign/db';

import { MikroOrmRunRepository } from './persistence/mikro-orm-run-repository';
import { RUN_REPOSITORY } from './tokens';

/**
 * The run record alone, importable by anything that only reads or writes
 * run rows — the janitor, the replay CLI — without the service that needs a
 * model behind it.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([
      QualityRun,
      QualityRunCriterion,
      QualityRunIteration,
      QualityRunFinding,
      QualityRunCriterionResult,
    ]),
  ],
  providers: [{ provide: RUN_REPOSITORY, useClass: MikroOrmRunRepository }],
  exports: [RUN_REPOSITORY],
})
export class RunsPersistenceModule {}
