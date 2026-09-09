import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';
import { MemoryModule } from '../memory/memory.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { PromptsModule } from '../prompts/prompts.module';
import { RunsModule } from '../runs/runs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, RunsModule, PromptsModule, MemoryModule, OrchestrationModule],
  controllers: [HealthController],
})
export class AppModule {}
