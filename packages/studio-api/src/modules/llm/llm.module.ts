import { Module } from '@nestjs/common';
import { createLlmClientFromEnv } from '@sysdesign/llm';

import { LLM_CLIENT } from './llm.token';

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
 * one or under `EVAL_DETERMINISTIC=1`.
 */
@Module({
  providers: [{ provide: LLM_CLIENT, useFactory: createLlmClientFromEnv }],
  exports: [LLM_CLIENT],
})
export class LlmModule {}
