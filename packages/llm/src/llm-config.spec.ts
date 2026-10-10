import { EngineConfigError } from '@sysdesign/config-kit';
import { describe, expect, it } from 'vitest';

import { PROVIDERS } from './create-client';
import {
  apiKeyFor,
  DEFAULT_LLM_CONFIG,
  llmConfigSchema,
  LLM_PROVIDERS,
  readChosenLlmConfig,
  readLlmConfig,
} from './llm-config';

/** A disk holding only the files named: engine.json chooses, the named file answers. */
const disk = (files: Record<string, string>) => (at: string) => {
  const found = Object.entries(files).find(([name]) => at.endsWith(name));
  if (found === undefined) throw new Error(`ENOENT ${at}`);
  return found[1];
};
const chose = (json: string) =>
  disk({ 'config/engine.json': '{"llm":"chosen"}', 'config/llm/chosen.json': json });

describe('the model configuration', () => {
  it('[QL-22] runs on the subscription when no file names anything else, so a checkout without one is unchanged', () => {
    expect(readLlmConfig('/repo', disk({}))).toEqual(DEFAULT_LLM_CONFIG);
    expect(DEFAULT_LLM_CONFIG.provider).toBe('claude-subscription');
    // Every provider the vocabulary declares is one the table can build.
    expect(Object.keys(PROVIDERS).sort()).toEqual([...LLM_PROVIDERS].sort());
  });

  it('[QL-22] takes the file as the whole answer, and refuses one it cannot read rather than falling back to a provider nobody chose', () => {
    const openai = readLlmConfig(
      '/repo',
      chose('{"provider":"openai-compatible","model":"gpt-4o-mini","apiKeyVar":"OPENAI_API_KEY"}'),
    );
    expect(openai).toMatchObject({ provider: 'openai-compatible', model: 'gpt-4o-mini' });
    // The settings a file leaves out come from the declared defaults. A file
    // that names no API gets the shape every OpenAI-shaped server implements,
    // so adding the newer one to one endpoint's file cannot reach a local
    // server that does not serve it — and `store` stays unsent rather than
    // guessed, since an endpoint with no such notion must not be told about it.
    expect(openai.strict).toBe(true);
    expect(openai.maxInFlight).toBeGreaterThan(0);
    expect(openai.api).toBe('chat');
    expect(openai.store).toBeUndefined();

    // And a file that does name one is taken at its word, either way.
    const hosted = readLlmConfig(
      '/repo',
      chose('{"provider":"openai-compatible","api":"responses","store":true}'),
    );
    expect(hosted).toMatchObject({ api: 'responses', store: true });
    expect(() =>
      readLlmConfig('/repo', chose('{"provider":"openai-compatible","api":"completions"}')),
    ).toThrow(EngineConfigError);

    // A file that is present and wrong is a refusal naming the field: the point
    // of writing the provider down is that what ran is what the file says.
    expect(() => readLlmConfig('/repo', chose('{"provider":"gpt"}'))).toThrow(EngineConfigError);
    expect(() => readLlmConfig('/repo', chose('not json'))).toThrow(EngineConfigError);
    expect(() =>
      readLlmConfig('/repo', chose('{"provider":"openai-compatible","nope":1}')),
    ).toThrow(EngineConfigError);

    // And the file it came from travels with it, so a boot can say which.
    expect(readChosenLlmConfig('/repo', chose('{"provider":"claude-subscription"}')).source).toBe(
      'config/llm/chosen.json',
    );
    expect(readChosenLlmConfig('/repo', disk({})).source).toBeNull();
  });

  it('[QL-22] names the variable holding a key and never a key, so the file is safe to commit', () => {
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
