import { describe, expect, it } from 'vitest';

import { chosenConfig, EngineConfigError, parseEngineEnv } from './engine-config';

/** A disk with only the files named, so a spec never reads the repository's own. */
const disk = (files: Record<string, string>) => (at: string) => {
  const found = Object.entries(files).find(([name]) => at.endsWith(name));
  if (found === undefined) throw new Error(`ENOENT ${at}`);
  return found[1];
};

describe('choosing a configuration by name', () => {
  it('[QL-62] reads a kind’s choice as the name of a file, so switching is one word and the file is complete', () => {
    const chosen = chosenConfig(
      'llm',
      '/repo',
      disk({
        'config/engine.env': '# a comment\n\nllm=openai\n',
        'config/llm/openai.json': '{"provider":"openai-compatible"}',
      }),
    );
    expect(chosen.name).toBe('openai');
    expect(chosen.path).toMatch(/config\/llm\/openai\.json$/);
    expect(chosen.text).toContain('openai-compatible');
  });

  it('[QL-62] a kind nobody named chooses nothing, and a name with no file behind it is refused', () => {
    // No file at all, and a file naming other kinds: both leave this kind to
    // its own default rather than inventing one.
    const none = chosenConfig('llm', '/repo', disk({}));
    expect(none).toEqual({ name: null, path: null, text: null });
    const other = chosenConfig('llm', '/repo', disk({ 'config/engine.env': 'store=qdrant\n' }));
    expect(other.name).toBeNull();

    // But a kind named with nothing behind it is the one outcome this exists
    // to prevent: choosing by name and silently running something else.
    expect(() =>
      chosenConfig('llm', '/repo', disk({ 'config/engine.env': 'llm=ollama\n' })),
    ).toThrow(EngineConfigError);
    expect(() =>
      chosenConfig('llm', '/repo', disk({ 'config/engine.env': 'llm=ollama\n' })),
    ).toThrow(/config\/llm\/ollama\.json does not exist/);
  });

  it('[QL-62] reads a KEY=value file the way one is written: comments, blanks, spacing, last wins', () => {
    expect(
      parseEngineEnv(
        ['# which model', '', '  llm = openai  ', 'store=qdrant', 'llm=qwen-local'].join('\n'),
      ),
    ).toEqual({ llm: 'qwen-local', store: 'qdrant' });
    // A line that is not a setting is not a setting.
    expect(parseEngineEnv('nonsense\n')).toEqual({});
  });
});
