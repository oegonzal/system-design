import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ExperienceProfile, Prompt } from '@sysdesign/db';
import { createLlmClientFromEnv } from '@sysdesign/llm';

import { PromptsController } from './prompts.controller';
import { LLM_CLIENT, PromptsService } from './prompts.service';

@Module({
  imports: [MikroOrmModule.forFeature([Prompt, ExperienceProfile])],
  controllers: [PromptsController],
  providers: [
    PromptsService,
    // Environment decides once, at boot: real enrichment with a key, silent
    // pass-through without one (or under EVAL_DETERMINISTIC=1).
    { provide: LLM_CLIENT, useFactory: createLlmClientFromEnv },
  ],
})
export class PromptsModule {}
