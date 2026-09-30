import { describe, expect, it } from 'vitest';

import { preflight } from './boot';

describe('the preflight', () => {
  it('[QL-22] serve and run refuse to boot without a model provider, naming both variables', () => {
    for (const argv of [[], ['serve'], ['run', 'tiny', 'goal.md']]) {
      expect(() => preflight(argv, {})).toThrow(/ANTHROPIC_API_KEY/);
      expect(() => preflight(argv, {})).toThrow(/QUALITY_LOOP_AUTH=claude-code/);
    }
  });

  it('[QL-22] serve and run announce the model they will run on, and refuse a bad stale threshold by name', () => {
    expect(preflight(['serve'], { ANTHROPIC_API_KEY: 'sk-test' })).toEqual({
      command: 'serve',
      model: { model: 'claude-sonnet-5' },
    });
    expect(preflight(['run'], { QUALITY_LOOP_AUTH: 'claude-code' })).toEqual({
      command: 'run',
      model: { model: 'claude-code/subscription' },
    });
    expect(() =>
      preflight(['serve'], {
        ANTHROPIC_API_KEY: 'sk-test',
        QUALITY_LOOP_RUN_STALE_AFTER_MS: 'soon',
      }),
    ).toThrow(/QUALITY_LOOP_RUN_STALE_AFTER_MS/);
  });

  it('[QL-22] replay needs no provider: it calls no model', () => {
    expect(preflight(['replay', '--pipeline', 'tiny'], {})).toEqual({
      command: 'replay',
      model: null,
    });
  });
});
