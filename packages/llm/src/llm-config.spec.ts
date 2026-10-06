import { describe, expect, it } from 'vitest';

import { PROVIDERS } from './create-client';
import {
  apiKeyFor,
  DEFAULT_LLM_CONFIG,
  llmConfigSchema,
  LLM_PROVIDERS,
  LlmConfigError,
  readLlmConfig,
} from './llm-config';

const file = (text: string) => () => text;
const missing = () => {
  throw new Error('ENOENT');
};

describe('the model configuration', () => {
  it('[QL-62] runs on the subscription when no file names anything else, so a checkout without one is unchanged', () => {
    expect(readLlmConfig('llm.config.json', missing)).toEqual(DEFAULT_LLM_CONFIG);
    expect(DEFAULT_LLM_CONFIG.provider).toBe('claude-subscription');
    // Every provider the vocabulary declares is one the table can build.
    expect(Object.keys(PROVIDERS).sort()).toEqual([...LLM_PROVIDERS].sort());
  });

  it('[QL-62] takes the file as the whole answer, and refuses one it cannot read rather than falling back to a provider nobody chose', () => {
    const openai = readLlmConfig(
      'at',
      file('{"provider":"openai-compatible","model":"gpt-4o-mini","apiKeyVar":"OPENAI_API_KEY"}'),
    );
    expect(openai).toMatchObject({ provider: 'openai-compatible', model: 'gpt-4o-mini' });
    // The settings a file leaves out come from the declared defaults.
    expect(openai.strict).toBe(true);
    expect(openai.maxInFlight).toBeGreaterThan(0);

    // A file that is present and wrong is a refusal naming the field: the point
    // of writing the provider down is that what ran is what the file says.
    expect(() => readLlmConfig('at', file('{"provider":"gpt"}'))).toThrow(LlmConfigError);
    expect(() => readLlmConfig('at', file('not json'))).toThrow(LlmConfigError);
    expect(() => readLlmConfig('at', file('{"provider":"openai-compatible","nope":1}'))).toThrow(
      LlmConfigError,
    );
  });

  it('[QL-62] names the variable holding a key and never a key, so the file is safe to commit', () => {
    // A value that looks like a secret is refused in the field that names one.
    expect(() =>
      llmConfigSchema.parse({ provider: 'openai-compatible', apiKeyVar: 'sk-abc123' }),
    ).toThrow();
    const config = llmConfigSchema.parse({
      provider: 'openai-compatible',
      apiKeyVar: 'OPENAI_API_KEY',
    });
    expect(apiKeyFor(config, { OPENAI_API_KEY: 'sk-live' })).toBe('sk-live');
    // Unset, empty, or named by nobody: all the same absence.
    expect(apiKeyFor(config, {})).toBeNull();
    expect(apiKeyFor(config, { OPENAI_API_KEY: '  ' })).toBeNull();
    expect(apiKeyFor(llmConfigSchema.parse({ provider: 'openai-compatible' }), {})).toBeNull();
  });
});
