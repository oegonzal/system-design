import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUN_STALE_AFTER_MS,
  RUN_STALE_AFTER_VAR,
  runJanitorOptionsFromEnv,
  runStaleAfterMs,
} from './stale-after';

describe('the stale threshold', () => {
  it('[QL-13] defaults to ten minutes, reads a positive integer of milliseconds, and refuses anything else by name', () => {
    expect(runStaleAfterMs({})).toBe(DEFAULT_RUN_STALE_AFTER_MS);
    expect(runStaleAfterMs({ [RUN_STALE_AFTER_VAR]: '' })).toBe(DEFAULT_RUN_STALE_AFTER_MS);
    expect(runStaleAfterMs({ [RUN_STALE_AFTER_VAR]: '30000' })).toBe(30_000);
    for (const bad of ['0', '-1', 'soon', '1.5', '10s']) {
      expect(() => runStaleAfterMs({ [RUN_STALE_AFTER_VAR]: bad })).toThrow(RUN_STALE_AFTER_VAR);
    }
  });

  it('[QL-13] sweeps as often as a row may stay silent', () => {
    expect(runJanitorOptionsFromEnv({ [RUN_STALE_AFTER_VAR]: '90000' })).toEqual({
      staleAfterMs: 90_000,
      intervalMs: 90_000,
    });
  });
});
