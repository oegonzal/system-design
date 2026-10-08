import { describe, expect, it } from 'vitest';

import { bound, composedBound, exact } from './bound';
import { bounded } from './bounded';

const CLAIM = bound(300);

describe('a declared bound', () => {
  it('[QL-58] is a target and a ceiling: a quarter over the target, or the floor when that is more', () => {
    expect(CLAIM).toEqual({ target: 300, ceiling: 375 });
    // Under ~160 characters the floor of forty is what clears a sentence.
    expect(bound(80)).toEqual({ target: 80, ceiling: 120 });
    expect(bound(6, 'list')).toEqual({ target: 6, ceiling: 8 });
    expect(bound(24, 'list')).toEqual({ target: 24, ceiling: 30 });
    expect(exact(16)).toEqual({ target: 16, ceiling: 16 });
  });

  it('[QL-58] composes from bounded parts and literal separators, each separator counted once', () => {
    const row = composedBound([bound(24), ' — ', bound(160), ' — ', bound(60)]);
    expect(row).toEqual({ target: 24 + 160 + 60 + 6, ceiling: 64 + 200 + 100 + 6 });
  });
});
