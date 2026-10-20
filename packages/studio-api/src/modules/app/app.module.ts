import { Module } from '@nestjs/common';
import { DbModule, HealthController } from '@sysdesign/nest-kit';

import { ExperiencesModule } from '../experiences/experiences.module';
import { ProgressModule } from '../progress/progress.module';
import { PromptsModule } from '../prompts/prompts.module';
import { QualityLoopModule } from '../quality-loop/quality-loop.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StarStoriesModule } from '../star-stories/star-stories.module';

@Module({
  imports: [
    DbModule,
    QualityLoopModule,
    ExperiencesModule,
    ProgressModule,
    PromptsModule,
    SessionsModule,
    StarStoriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
