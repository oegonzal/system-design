import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUN_STALE_AFTER_MS,
  HEARTBEATS_PER_STALE_THRESHOLD,
  RUN_STALE_AFTER_VAR,
  runJanitorOptionsFromEnv,
  runStaleAfterMs,
} from './stale-after';

describe('the stale threshold', () => {
  // A reader is told "running" about a dead run for as long as this lasts,
  // so it is minutes, not ten of them; the ticker beats three times within it
  // whatever the model is doing, and never faster than once a second.
  it('[QL-13] defaults to three minutes, reads a positive integer of milliseconds, and refuses anything else by name', () => {
    expect(DEFAULT_RUN_STALE_AFTER_MS).toBe(3 * 60 * 1000);
    expect(HEARTBEATS_PER_STALE_THRESHOLD).toBe(3);
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
