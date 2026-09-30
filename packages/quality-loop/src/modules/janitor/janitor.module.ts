import { Module } from '@nestjs/common';

import { OrchestrationRecordModule } from '../orchestration/orchestration-record.module';
import { RunsPersistenceModule } from '../runs/runs-persistence.module';
import { RunJanitor } from './run-janitor';
import { runJanitorOptionsFromEnv } from './stale-after';
import { RUN_JANITOR_OPTIONS } from './tokens';

/**
 * The sweeper over both run tables, and the options every in-flight run
 * heartbeats by. Imported by the served application and the CLI's `run` —
 * never by `replay`, which only reads.
 */
@Module({
  imports: [RunsPersistenceModule, OrchestrationRecordModule],
  providers: [RunJanitor, { provide: RUN_JANITOR_OPTIONS, useFactory: runJanitorOptionsFromEnv }],
  exports: [RUN_JANITOR_OPTIONS],
})
export class JanitorModule {}
