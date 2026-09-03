import { Module } from '@nestjs/common';

import { createEvalLlmFromEnv } from '@sysdesign/llm';

import { EvalRunnerService } from './eval-runner.service';
import { LLM_CLIENT } from './llm.token';
import { PollerService } from './poller.service';

@Module({
  providers: [
    PollerService,
    EvalRunnerService,
    // Environment decides once, at boot: real client with a key, the Claude
    // subscription under EVAL_AUTH=claude-code, else no-op (and always no-op
    // under EVAL_DETERMINISTIC=1). The LLM passes check `enabled` and degrade
    // to diagnostics artifacts.
    { provide: LLM_CLIENT, useFactory: createEvalLlmFromEnv },
  ],
})
export class PollerModule {}
