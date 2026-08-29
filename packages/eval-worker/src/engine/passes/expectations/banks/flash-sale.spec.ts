import { describe, expect, it } from 'vitest';

import { contextFor, flashSaleFacts, graph, node } from '../../../testing';
import { flashSaleExpectations } from './flash-sale';

/**
 * Focused verdicts only: the flash-sale bank's end-to-end behavior is pinned
 * by the calibration fixtures and the engine spec, so this file covers the
 * cases those reference graphs cannot express.
 */
function expectationById(id: string) {
  const expectation = flashSaleExpectations.find((candidate) => candidate.id === id);
  if (!expectation) throw new Error(`unknown expectation: ${id}`);
  return expectation;
}

describe('flash-sale expectation bank', () => {
  it('exp.fst.idempotent-checkout: declared idempotent operations satisfy without the config knob', () => {
    const declared = graph([
      node('service-1', 'service', {
        label: 'Checkout service',
        operations: [
          { name: 'checkout', kind: 'command', idempotent: true },
          { name: 'getOrder', kind: 'query' },
        ],
      }),
    ]);
    const check = expectationById('exp.fst.idempotent-checkout').satisfiedBy(
      contextFor(declared, flashSaleFacts()),
    );
    expect(check.met).toBe(true);
    expect(check.evidenceNodeIds).toEqual(['service-1']);
  });
});
