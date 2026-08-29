import { describe, expect, it } from 'vitest';

import { NODE_KINDS } from './canvas';
import { NODE_KIND_GUIDE, interfaceSummary } from './node-guide';

const MAX_LINE = 160;

describe('NODE_KIND_GUIDE', () => {
  it('[UX-7] teaches every contract kind with bounded, non-empty prose', () => {
    for (const kind of NODE_KINDS) {
      const guide = NODE_KIND_GUIDE[kind];
      expect(guide.what.trim().length).toBeGreaterThan(0);
      expect(guide.whenToUse.trim().length).toBeGreaterThan(0);
      expect(guide.what.length).toBeLessThanOrEqual(MAX_LINE);
      expect(guide.whenToUse.length).toBeLessThanOrEqual(MAX_LINE);
    }
  });

  it('[UX-7] derives the interface sentence from the capability table', () => {
    expect(interfaceSummary('service')).toBe(
      'Can declare commands and queries on its interface; connections carry them.',
    );
    expect(interfaceSummary('worker')).toBe(
      'Can declare commands on its interface; connections carry them.',
    );
    expect(interfaceSummary('queue')).toContain('producers and consumers');
    expect(interfaceSummary('database')).toContain('Passive storage');
    // Routing infrastructure and observability have nothing interface-shaped to say.
    expect(interfaceSummary('load-balancer')).toBeNull();
    expect(interfaceSummary('monitoring')).toBeNull();
  });
});
