import { Module } from '@nestjs/common';

import { createLlmClientFromEnv } from '@sysdesign/llm';

import { EvalRunnerService } from './eval-runner.service';
import { LLM_CLIENT } from './llm.token';
import { PollerService } from './poller.service';

@Module({
  providers: [
    PollerService,
    EvalRunnerService,
    // Environment decides once, at boot: real client with a key, no-op
    // without one (or under EVAL_DETERMINISTIC=1). The LLM passes in the
    // eval profile check `enabled` and degrade to diagnostics artifacts.
    { provide: LLM_CLIENT, useFactory: createLlmClientFromEnv },
  ],
})
export class PollerModule {}
