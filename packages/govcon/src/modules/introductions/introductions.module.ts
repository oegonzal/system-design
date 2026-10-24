import { Module } from '@nestjs/common';
import { LoopClient } from '@sysdesign/loop-client';

import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { SpendingModule } from '../spending/spending.module';
import { TargetsModule } from '../targets/targets.module';
import { IntroductionsController } from './introductions.controller';
import { IntroductionsService } from './introductions.service';
import { loopClientFromEnv } from './loop-client.factory';

/**
 * Introductions: the quality loop drafting a note for a tracked firm or
 * award about one program, from the target, the award's snapshot and the
 * profile's own words. The loop's address is read from the environment here
 * and nowhere below.
 */
@Module({
  imports: [SourcesModule, ProfilesModule, SpendingModule, TargetsModule],
  controllers: [IntroductionsController],
  providers: [IntroductionsService, { provide: LoopClient, useFactory: () => loopClientFromEnv() }],
})
export class IntroductionsModule {}
