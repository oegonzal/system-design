import { Module } from '@nestjs/common';
import { createImproverLlmFromEnv, createLlmClientFromEnv } from '@sysdesign/llm';

import { LLM_CLIENT, SUGGESTION_LLM } from './llm.token';

/**
 * One model client for the whole API.
 *
 * The token used to be a private symbol inside `PromptsService`, which was fine
 * while enrichment was the only caller. A second caller in another module can
 * either declare a second provider — and with it a second Anthropic transport
 * and connection pool, the very thing `withRecorder` shares to avoid — or the
 * provider can move here and be exported once. This is the second.
 *
 * The environment decides at boot: a real client with a key, the no-op without
 * one or under `EVAL_DETERMINISTIC=1`. The suggesters get the assistive client
 * (see `SUGGESTION_LLM`), which can also run on a Claude subscription.
 */
@Module({
  providers: [
    { provide: LLM_CLIENT, useFactory: createLlmClientFromEnv },
    { provide: SUGGESTION_LLM, useFactory: createImproverLlmFromEnv },
  ],
  exports: [LLM_CLIENT, SUGGESTION_LLM],
})
export class LlmModule {}
