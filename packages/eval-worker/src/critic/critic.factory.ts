import { createLlmClientFromEnv, type LlmClient } from '@sysdesign/llm';

import { AnthropicCritic } from './anthropic-critic';
import { EvalCritic } from './eval-critic';
import { NoopCritic } from './noop-critic';

export function createCritic(llm: LlmClient = createLlmClientFromEnv()): EvalCritic {
  return llm.enabled ? new AnthropicCritic(llm) : new NoopCritic();
}
