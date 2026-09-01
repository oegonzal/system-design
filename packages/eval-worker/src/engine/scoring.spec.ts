import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION } from './scoring';

describe('scoring constants', () => {
  it('pins the engine version', () => {
    expect(ENGINE_VERSION).toBe('2.2.0');
  });
});
