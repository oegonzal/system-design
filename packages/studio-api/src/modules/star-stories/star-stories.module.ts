import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ExperienceProfile, Prompt, StarStory } from '@sysdesign/db';

import { StarStoriesController } from './star-stories.controller';
import { StarStoriesService } from './star-stories.service';

@Module({
  imports: [MikroOrmModule.forFeature([StarStory, Prompt, ExperienceProfile])],
  controllers: [StarStoriesController],
  providers: [StarStoriesService],
})
export class StarStoriesModule {}
