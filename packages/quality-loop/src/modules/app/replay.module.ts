import { Module } from '@nestjs/common';
import { DbModule } from '@sysdesign/nest-kit';

import { PipelinesModule } from '../runs/pipelines.module';
import { RunsPersistenceModule } from '../runs/runs-persistence.module';

/**
 * What `main.js replay` boots: the pipelines as data and the run record, and
 * nothing else — no model provider, since no model is called; no janitor,
 * since a reader never fails another process's run; no HTTP surface.
 */
@Module({ imports: [DbModule, PipelinesModule, RunsPersistenceModule] })
export class ReplayModule {}
