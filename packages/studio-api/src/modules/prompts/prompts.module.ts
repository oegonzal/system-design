import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignSession, ExperienceProfile, Prompt, PromptGeneration } from '@sysdesign/db';

import { ProgressModule } from '../progress/progress.module';
import { PromptGenerationService } from './prompt-generation.service';
import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([Prompt, PromptGeneration, ExperienceProfile, DesignSession]),
    // A generation that names no format is pointed at the weakest competency.
    ProgressModule,
  ],
  controllers: [PromptsController],
  providers: [PromptsService, PromptGenerationService],
  // Sessions grade against a prompt's criteria, and mint them when a prompt
  // is submitted against before it was ever read.
  exports: [PromptsService],
})
export class PromptsModule {}
