import { describe, expect, it } from 'vitest';

import { substituteLocationLabels } from './location-labels';

const locations = [
  { ref: 'node.1', label: 'n-1 · client · Client', part: 'node', key: 'n-1' },
  { ref: 'node.12', label: 'n-12 · cache · Session cache', part: 'node', key: 'n-12' },
  { ref: 'binding.1', label: 'c1 ← n-2', part: 'binding', key: 'c1' },
] as const;

describe('substituteLocationLabels', () => {
  it('[EVAL-2] substitutes exact location ids in prose with their labels, longest id first, leaving unknown ids alone', () => {
    expect(
      substituteLocationLabels(
        'node.1 calls node.12 through binding.1; node.9 and node.120 are not listed',
        locations,
      ),
    ).toBe(
      'n-1 · client · Client calls n-12 · cache · Session cache through c1 ← n-2; node.9 and node.120 are not listed',
    );
  });

  it('leaves prose alone when nothing was grounded, and treats the dot as a literal', () => {
    expect(substituteLocationLabels('node.1 stays', [])).toBe('node.1 stays');
    expect(substituteLocationLabels('nodeX1 stays', locations)).toBe('nodeX1 stays');
  });
});
