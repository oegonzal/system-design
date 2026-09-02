import { Module } from '@nestjs/common';

import { createImproverLlmFromEnv } from '@sysdesign/llm';

import { ImprovementPollerService } from './improvement-poller.service';
import { ImprovementRunnerService } from './improvement-runner.service';
import { IMPROVER_LLM } from './llm.token';

@Module({
  providers: [
    ImprovementPollerService,
    ImprovementRunnerService,
    // The improver's own switch: IMPROVER_DETERMINISTIC ?? EVAL_DETERMINISTIC.
    // The coach is LLM-required — with a no-op client here, claimed runs fail
    // honestly as 'llm-unavailable' instead of pretending to improve.
    { provide: IMPROVER_LLM, useFactory: createImproverLlmFromEnv },
  ],
})
export class ImproverModule {}
