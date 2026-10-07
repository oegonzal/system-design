import { llmConfigSchema, MissingModelProviderError } from '@sysdesign/llm';
import { describe, expect, it, vi } from 'vitest';

import { preflight } from './boot';

const loggedIn = () => Promise.resolve();
const noLogin = () => Promise.reject(new MissingModelProviderError());

/**
 * The choice a spec makes for itself. Never the repository's own: a spec that
 * reads `config/engine.json` asserts whatever this checkout happens to be set
 * to, and passes or fails on an edit that has nothing to do with it.
 */
const chose = (overrides: Record<string, unknown> = {}, source = 'config/llm/spec.json') => ({
  config: llmConfigSchema.parse({ provider: 'claude-subscription', ...overrides }),
  source,
});

describe('the preflight', () => {
  it('[QL-22] serve and run refuse to boot without a Claude Code login, saying how to get one', async () => {
    for (const argv of [[], ['serve'], ['run', 'tiny', 'goal.md']]) {
      await expect(preflight(argv, {}, noLogin, chose())).rejects.toThrow(/claude login/);
      await expect(preflight(argv, {}, noLogin, chose())).rejects.toThrow(/claude setup-token/);
    }
  });

  it('[QL-22] serve and run announce the model they will run on, and refuse a bad stale threshold by name before asking for a login', async () => {
    await expect(preflight(['serve'], {}, loggedIn, chose())).resolves.toEqual({
      command: 'serve',
      model: { model: 'claude-code/subscription' },
      source: 'config/llm/spec.json',
    });
    // The model a process announces is the configured one — the file's, not
    // the environment's, so every process of a deployment announces the same.
    const pinned = chose({ model: 'claude-opus-5' }, 'config/llm/pinned.json');
    await expect(preflight(['run'], {}, loggedIn, pinned)).resolves.toEqual({
      command: 'run',
      model: { model: 'claude-opus-5' },
      // Announced with the file that chose it: a choice read once at boot is
      // invisible afterwards, and an edited file looks like an ignored one.
      source: 'config/llm/pinned.json',
    });
    const checkLogin = vi.fn(loggedIn);
    await expect(
      preflight(['serve'], { QUALITY_LOOP_RUN_STALE_AFTER_MS: 'soon' }, checkLogin, chose()),
    ).rejects.toThrow(/QUALITY_LOOP_RUN_STALE_AFTER_MS/);
    expect(checkLogin).not.toHaveBeenCalled();
  });

  it('[QL-22] replay needs no login: it calls no model', async () => {
    const checkLogin = vi.fn(noLogin);
    await expect(
      preflight(['replay', '--pipeline', 'tiny'], {}, checkLogin, chose()),
    ).resolves.toEqual({
      source: null,
      command: 'replay',
      model: null,
    });
    expect(checkLogin).not.toHaveBeenCalled();
  });
});
