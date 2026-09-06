import { Module } from '@nestjs/common';

import { PromptsModule } from '../prompts/prompts.module';
import { RunsModule } from '../runs/runs.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RunsModule, PromptsModule],
  controllers: [HealthController],
})
export class AppModule {}
