import { describe, expect, it } from 'vitest';

import { z } from 'zod';

import { chosenConfig, EngineConfigError, readChosen, readEngineConfig } from './engine-config';

/** A disk with only the files named, so a spec never reads the repository's own. */
const disk = (files: Record<string, string>) => (at: string) => {
  const found = Object.entries(files).find(([name]) => at.endsWith(name));
  if (found === undefined) throw new Error(`ENOENT ${at}`);
  return found[1];
};

describe('choosing a configuration by name', () => {
  it('[QL-22] reads a kind’s choice as the name of a file, so switching is one word and the file is complete', () => {
    const chosen = chosenConfig(
      'llm',
      '/repo',
      disk({
        'config/engine.json': '{"llm":"openai","store":"qdrant"}',
        'config/llm/openai.json': '{"provider":"openai-compatible"}',
      }),
    );
    expect(chosen.name).toBe('openai');
    expect(chosen.path).toMatch(/config\/llm\/openai\.json$/);
    expect(chosen.text).toContain('openai-compatible');

    // Kinds this build has never heard of are carried, not refused: the file
    // would otherwise be version-locked to the code that reads it.
    expect(readEngineConfig('/repo', disk({ 'config/engine.json': '{"store":"qdrant"}' }))).toEqual(
      {
        store: 'qdrant',
      },
    );
  });

  it('[QL-22] a kind nobody named chooses nothing, and a name with no file behind it is refused', () => {
    const none = chosenConfig('llm', '/repo', disk({}));
    expect(none).toEqual({ name: null, path: null, text: null });
    const other = chosenConfig(
      'llm',
      '/repo',
      disk({ 'config/engine.json': '{"store":"qdrant"}' }),
    );
    expect(other.name).toBeNull();

    // But a kind named with nothing behind it is the one outcome this exists
    // to prevent: choosing by name and silently running something else.
    const missing = disk({ 'config/engine.json': '{"llm":"ollama"}' });
    expect(() => chosenConfig('llm', '/repo', missing)).toThrow(EngineConfigError);
    expect(() => chosenConfig('llm', '/repo', missing)).toThrow(
      /chooses llm "ollama".*config\/llm\/ollama\.json does not exist/,
    );
  });

  it('[QL-22] refuses a file it cannot read, and a name that is a path rather than a name', () => {
    expect(() => readEngineConfig('/repo', disk({ 'config/engine.json': 'not json' }))).toThrow(
      /is not JSON/,
    );
    // A name is read off a file and turned into a path: one carrying a
    // separator or a `..` would read a file outside the folder it names.
    for (const bad of ['../secrets', 'a/b', '/etc/passwd', '']) {
      expect(() =>
        readEngineConfig('/repo', disk({ 'config/engine.json': JSON.stringify({ llm: bad }) })),
      ).toThrow(EngineConfigError);
    }
    // A plain file name is fine, dots and dashes included.
    expect(
      readEngineConfig('/repo', disk({ 'config/engine.json': '{"llm":"qwen-local.v2"}' })),
    ).toEqual({ llm: 'qwen-local.v2' });
  });

  it('[QL-22] reads the chosen file against its owner’s schema, naming the file and every field at fault, and nothing for a kind nobody named', () => {
    const schema = z.strictObject({ after: z.array(z.string()), failures: z.boolean() });
    const files = (body: string) =>
      disk({ 'config/engine.json': '{"capture":"entries"}', 'config/capture/entries.json': body });
    expect(
      readChosen('capture', schema, '/pkg', files('{"after":["fill"],"failures":true}')),
    ).toEqual({
      config: { after: ['fill'], failures: true },
      source: 'config/capture/entries.json',
    });
    expect(readChosen('session', schema, '/pkg', files('{}'))).toBeNull();
    expect(() => readChosen('capture', schema, '/pkg', files('not json'))).toThrow(
      /config\/capture\/entries\.json is not JSON/,
    );
    const refusal = (() => {
      try {
        readChosen('capture', schema, '/pkg', files('{"after":"fill","failures":true,"extra":1}'));
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(refusal).toBeInstanceOf(EngineConfigError);
    expect(String(refusal)).toMatch(
      /config\/capture\/entries\.json is not a capture configuration — /,
    );
    // Every field at fault is named: the wrong type and the key nobody declared.
    expect(String(refusal)).toMatch(/after: /);
    expect(String(refusal)).toMatch(/\(root\): /);
  });
});
