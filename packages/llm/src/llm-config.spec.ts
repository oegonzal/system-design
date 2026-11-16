import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EngineConfigError } from '@sysdesign/config-kit';
import { describe, expect, it } from 'vitest';

import { PROVIDERS } from './create-client';
import {
  apiKeyFor,
  DEFAULT_LLM_CONFIG,
  describeLlmSource,
  llmConfigSchema,
  LLM_ENV,
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

  it('[QL-22] a Bedrock file pins its model and its region or is refused by field; the small model is its to name', () => {
    const bare = { provider: 'claude-bedrock' };
    expect(() => llmConfigSchema.parse(bare)).toThrow(/must declare its model/);
    expect(() => llmConfigSchema.parse(bare)).toThrow(/must declare its region/);
    expect(() =>
      llmConfigSchema.parse({ ...bare, model: 'us.anthropic.claude-sonnet-4-6' }),
    ).toThrow(/must declare its region/);
    const pinned = { ...bare, model: 'us.anthropic.claude-sonnet-4-6', region: 'us-east-1' };
    expect(llmConfigSchema.parse(pinned)).toMatchObject({
      provider: 'claude-bedrock',
      model: 'us.anthropic.claude-sonnet-4-6',
      region: 'us-east-1',
    });
    expect(llmConfigSchema.parse(pinned).smallModel).toBeUndefined();
    expect(
      llmConfigSchema.parse({
        ...pinned,
        smallModel: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      }).smallModel,
    ).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    // The subscription row keeps its model optional, as every checkout without a file relies on.
    expect(llmConfigSchema.parse({ provider: 'claude-subscription' }).model).toBeUndefined();
    // Read from a chosen file, the refusal names the file and the field.
    expect(() =>
      readLlmConfig('/repo', chose('{"provider":"claude-bedrock","region":"us-east-1"}')),
    ).toThrow(
      /config\/llm\/chosen\.json is not a llm configuration — model: a claude-bedrock configuration must declare its model/,
    );
  });

  it('[QL-22] LLM_CHOICE names the file a deployment runs on, over the engine file, and the boot line says which chose', () => {
    const files = disk({
      'config/engine.json': '{"llm":"claude-subscription"}',
      'config/llm/claude-subscription.json': '{"provider":"claude-subscription"}',
      'config/llm/claude-bedrock.json':
        '{"provider":"claude-bedrock","model":"us.anthropic.claude-sonnet-4-6","region":"us-east-1"}',
    });
    const cloud = readChosenLlmConfig('/repo', files, { LLM_CHOICE: 'claude-bedrock' });
    expect(cloud.config.provider).toBe('claude-bedrock');
    expect(cloud.source).toBe('config/llm/claude-bedrock.json');
    expect(describeLlmSource(cloud)).toBe('config/llm/claude-bedrock.json (LLM_CHOICE)');
    expect(readLlmConfig('/repo', files, { LLM_CHOICE: ' claude-bedrock ' }).provider).toBe(
      'claude-bedrock',
    );
    // Unset or blank, the engine file decides, and the line names the file alone.
    for (const env of [{}, { LLM_CHOICE: '' }, { LLM_CHOICE: '   ' }]) {
      const laptop = readChosenLlmConfig('/repo', files, env);
      expect(laptop.config.provider).toBe('claude-subscription');
      expect(describeLlmSource(laptop)).toBe('config/llm/claude-subscription.json');
    }
    expect(describeLlmSource(readChosenLlmConfig('/repo', disk({}), {}))).toBe(
      'no config/engine.json choice — the default',
    );
    // A name with no file behind it, or no name at all, is config-kit's
    // refusal — never a quiet run on the engine file's choice.
    expect(() => readChosenLlmConfig('/repo', files, { LLM_CHOICE: 'nope' })).toThrow(
      /the caller chooses llm "nope", but config\/llm\/nope\.json does not exist/,
    );
    expect(() => readChosenLlmConfig('/repo', files, { LLM_CHOICE: '../engine' })).toThrow(
      EngineConfigError,
    );
  });

  it('[QL-22] the one environment variable this package reads is declared once and read in one place', () => {
    expect(LLM_ENV.choice).toEqual({ name: 'LLM_CHOICE', fallback: undefined });
    // No other module names the variable or reaches the row: a second reader
    // would be a second answer to "which file", the thing the row exists to prevent.
    const sources = readdirSync(__dirname).filter((file) => file.endsWith('.ts'));
    const naming = (text: string): string[] =>
      sources.filter((file) => readFileSync(join(__dirname, file), 'utf8').includes(text)).sort();
    expect(naming("'LLM_CHOICE'")).toEqual(['llm-config.spec.ts', 'llm-config.ts']);
    expect(naming('LLM_ENV.choice')).toEqual(['llm-config.spec.ts', 'llm-config.ts']);
    // Nor does any file reach the variable directly, around the row.
    const reaching = sources
      .filter((file) =>
        /(?:process\.env|\benv)\s*(?:\.\s*LLM_CHOICE\b|\[\s*['"`]LLM_CHOICE['"`]\s*\])/.test(
          readFileSync(join(__dirname, file), 'utf8'),
        ),
      )
      .sort();
    expect(reaching).toEqual([]);
  });
});
