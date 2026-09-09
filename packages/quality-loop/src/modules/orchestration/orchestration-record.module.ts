import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { OrchestrationRun, OrchestrationRunChild } from '@sysdesign/db';

import { MikroOrmOrchestrationRunRepository } from './persistence/mikro-orm-orchestration-run-repository';
import { ORCHESTRATION_RUN_REPOSITORY } from './tokens';

/**
 * The record alone, importable by any module that only reads or writes
 * orchestration rows — the memory module's re-index reads one — without
 * pulling in the runner and the hosts it is bound to.
 */
@Module({
  imports: [MikroOrmModule.forFeature([OrchestrationRun, OrchestrationRunChild])],
  providers: [
    { provide: ORCHESTRATION_RUN_REPOSITORY, useClass: MikroOrmOrchestrationRunRepository },
  ],
  exports: [ORCHESTRATION_RUN_REPOSITORY],
})
export class OrchestrationRecordModule {}
