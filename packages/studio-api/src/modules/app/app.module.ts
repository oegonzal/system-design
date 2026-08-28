import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { ExperiencesModule } from '../experiences/experiences.module';
import { PromptsModule } from '../prompts/prompts.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StarStoriesModule } from '../star-stories/star-stories.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    DbModule,
    ExperiencesModule,
    PromptsModule,
    SessionsModule,
    EvaluationsModule,
    StarStoriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
