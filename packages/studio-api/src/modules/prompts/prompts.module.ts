import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ExperienceProfile, Prompt } from '@sysdesign/db';
import { PromptsController } from './prompts.controller';
import { LlmModule } from '../llm/llm.module';
import { PromptsService } from './prompts.service';

@Module({
  imports: [MikroOrmModule.forFeature([Prompt, ExperienceProfile]), LlmModule],
  controllers: [PromptsController],
  providers: [PromptsService],
})
export class PromptsModule {}
