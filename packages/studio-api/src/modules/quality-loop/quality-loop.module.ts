import { Global, Module } from '@nestjs/common';

import { GradingController } from './grading.controller';
import { HttpQualityLoopClient } from './http-quality-loop.client';
import { QualityLoopClient } from './quality-loop.client';

export const DEFAULT_QUALITY_LOOP_URL = 'http://localhost:3003';

/**
 * The one binding of the grader port. Global, because prompts, sessions and
 * the coach all speak to the loop and none of them should re-import a module
 * to do so. The integration harness overrides `QualityLoopClient` with a fake;
 * production reads `QUALITY_LOOP_URL` once, here, at the composition root.
 */
@Global()
@Module({
  controllers: [GradingController],
  providers: [
    {
      provide: QualityLoopClient,
      useFactory: () =>
        new HttpQualityLoopClient(process.env['QUALITY_LOOP_URL'] ?? DEFAULT_QUALITY_LOOP_URL),
    },
  ],
  exports: [QualityLoopClient],
})
export class QualityLoopModule {}
