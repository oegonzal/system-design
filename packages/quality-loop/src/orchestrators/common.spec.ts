import { describe, expect, it } from 'vitest';

import { briefRoutes, refuseInternal } from './common';
import { summaryOf } from './runner/testing';

const registry = [
  summaryOf('tiny'),
  summaryOf('system-design-canvas', 80, 'composed'),
  summaryOf('memory-recall', 80, 'composed'),
];

describe('the pipelines a brief may go to', () => {
  it('[QL-24] routes only to pipelines that take a brief — a composed-goal pipeline is never offered', () => {
    expect(briefRoutes(registry)).toEqual([{ id: 'tiny', description: 'tiny grades' }]);
    expect(briefRoutes([])).toEqual([]);
  });

  it('[QL-24] refuses a composed-goal pipeline as a target, by its declaration, and nothing else', () => {
    expect(refuseInternal({ pipeline: 'system-design-canvas', goal: 'g' }, registry)).toMatch(
      /not a target: it takes a composed goal/,
    );
    expect(refuseInternal({ pipeline: 'memory-recall', goal: 'g' }, registry)).toMatch(
      /not a target/,
    );
    expect(refuseInternal({ pipeline: 'tiny', goal: 'g' }, registry)).toBeNull();
    // An unregistered id is the service's 404, which comes before any refusal.
    expect(refuseInternal({ pipeline: 'nowhere', goal: 'g' }, registry)).toBeNull();
    expect(refuseInternal({ goal: 'g' }, registry)).toBeNull();
  });
});
