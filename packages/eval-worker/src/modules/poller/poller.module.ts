import { Module } from '@nestjs/common';

import { createCritic } from '../../critic/critic.factory';
import { EvalCritic } from '../../critic/eval-critic';
import { EvalRunnerService } from './eval-runner.service';
import { PollerService } from './poller.service';

@Module({
  providers: [
    PollerService,
    EvalRunnerService,
    // Environment decides once, at boot: real critic with a key, no-op
    // without one (or under EVAL_DETERMINISTIC=1).
    { provide: EvalCritic, useFactory: createCritic },
  ],
})
export class PollerModule {}
