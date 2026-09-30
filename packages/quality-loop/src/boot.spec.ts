import { describe, expect, it, vi } from 'vitest';
import { MissingModelProviderError } from '@sysdesign/llm';

import { preflight } from './boot';

const loggedIn = () => Promise.resolve();
const noLogin = () => Promise.reject(new MissingModelProviderError());

describe('the preflight', () => {
  it('[QL-22] serve and run refuse to boot without a Claude Code login, saying how to get one', async () => {
    for (const argv of [[], ['serve'], ['run', 'tiny', 'goal.md']]) {
      await expect(preflight(argv, {}, noLogin)).rejects.toThrow(/claude login/);
      await expect(preflight(argv, {}, noLogin)).rejects.toThrow(/claude setup-token/);
    }
  });

  it('[QL-22] serve and run announce the model they will run on, and refuse a bad stale threshold by name before asking for a login', async () => {
    await expect(preflight(['serve'], {}, loggedIn)).resolves.toEqual({
      command: 'serve',
      model: { model: 'claude-code/subscription' },
    });
    await expect(preflight(['run'], { LLM_MODEL: 'claude-opus-5' }, loggedIn)).resolves.toEqual({
      command: 'run',
      model: { model: 'claude-opus-5' },
    });
    const checkLogin = vi.fn(loggedIn);
    await expect(
      preflight(['serve'], { QUALITY_LOOP_RUN_STALE_AFTER_MS: 'soon' }, checkLogin),
    ).rejects.toThrow(/QUALITY_LOOP_RUN_STALE_AFTER_MS/);
    expect(checkLogin).not.toHaveBeenCalled();
  });

  it('[QL-22] replay needs no login: it calls no model', async () => {
    const checkLogin = vi.fn(noLogin);
    await expect(preflight(['replay', '--pipeline', 'tiny'], {}, checkLogin)).resolves.toEqual({
      command: 'replay',
      model: null,
    });
    expect(checkLogin).not.toHaveBeenCalled();
  });
});
