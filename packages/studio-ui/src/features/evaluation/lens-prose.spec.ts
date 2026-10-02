import { describe, expect, it } from 'vitest';

import { lensProse } from './lens-prose';

const locations = [
  { ref: 'node.1', label: 'n-1 · client · Client', part: 'node', key: 'n-1', name: 'Client' },
  {
    ref: 'node.5',
    label: 'n-5 · database · Orders DB',
    part: 'node',
    key: 'n-5',
    name: 'Orders DB',
  },
  {
    ref: 'node.12',
    label: 'n-12 · cache · Session cache',
    part: 'node',
    key: 'n-12',
    name: 'Session cache',
  },
  { ref: 'edge.1', label: 'e-1 · n-1 → n-5 (sync)', part: 'edge', key: 'e-1' },
  { ref: 'edge.2', label: 'e-2 · n-5 → n-12 (sync)', part: 'edge', key: 'e-2' },
  { ref: 'binding.1', label: 'c1 binding (n-2)', part: 'binding', key: 'c1' },
  { ref: 'rationale.3', label: 'Client rationale (n-1)', part: 'rationale', key: 'n-1' },
  { ref: 'narration.1', label: 'c5 narration', part: 'narration', key: 'c5' },
] as const;

describe('lensProse', () => {
  it('[EVAL-2] substitutes exact location ids in prose with their labels, longest id first, leaving unknown ids alone', () => {
    expect(
      lensProse(
        'node.1 calls node.12 through binding.1; node.9 and node.120 are not listed',
        locations,
      ),
    ).toBe(
      'n-1 · client · Client calls n-12 · cache · Session cache through c1 binding (n-2); node.9 and node.120 are not listed',
    );
  });

  it('[EVAL-2] reads a ref a sentence capitalised, and a run of refs, as the places they name', () => {
    expect(
      lensProse('Rationale.3 asserts the client polls; Narration.1 claims multi-AZ.', locations),
    ).toBe('Client rationale (n-1) asserts the client polls; c5 narration claims multi-AZ.');
    // A run is a path: its ends read by their keys, never one full label each.
    expect(lensProse('the path edge.1-2 carries the read', locations)).toBe(
      'the path e-1 to e-2 carries the read',
    );
  });

  it('[EVAL-2] gives a place its short label once the sentence has named it — beside the ref, or earlier on', () => {
    expect(lensProse('Orders DB (node.5) models no such sub-entities', locations)).toBe(
      'Orders DB (n-5) models no such sub-entities',
    );
    expect(lensProse('node.5 holds the orders, and node.5 has no replica', locations)).toBe(
      'n-5 · database · Orders DB holds the orders, and n-5 has no replica',
    );
  });

  it('[EVAL-2] words a finding type a lens wrote as its token, and leaves ordinary words alone', () => {
    expect(lensProse('per the missing_requirement defect and the data_integrity one', [])).toBe(
      'per the missing requirement defect and the data integrity one',
    );
    expect(lensProse('a contradiction between snake_case and the drawing', [])).toBe(
      'a contradiction between snake_case and the drawing',
    );
  });

  it('leaves prose alone when nothing was grounded, and treats the dot as a literal', () => {
    expect(lensProse('node.1 stays', [])).toBe('node.1 stays');
    expect(lensProse('nodeX1 stays', locations)).toBe('nodeX1 stays');
  });
});
