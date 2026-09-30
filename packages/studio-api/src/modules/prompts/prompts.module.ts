import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DesignSession, ExperienceProfile, Prompt, PromptGeneration } from '@sysdesign/db';

import { PromptsController } from './prompts.controller';
import { PromptsService } from './prompts.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([Prompt, PromptGeneration, ExperienceProfile, DesignSession]),
  ],
  controllers: [PromptsController],
  providers: [PromptsService],
  // Sessions grade against a prompt's criteria, and mint them when a prompt
  // is submitted against before it was ever read.
  exports: [PromptsService],
})
export class PromptsModule {}
