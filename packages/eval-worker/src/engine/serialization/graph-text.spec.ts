import { describe, expect, it } from 'vitest';

import { flashSaleFacts, graph, node } from '../testing';
import { describeDesign, GRAPH_TEXT_MAX_CHARS } from './graph-text';

describe('describeDesign', () => {
  it('renders every NFR with its id, statement and target', () => {
    const { text, clipped } = describeDesign(graph([node('n-1', 'client')]), flashSaleFacts());
    expect(clipped).toBe(false);
    expect(text).toContain(
      'nfr fst-avail-sale-window [availability] "The sale window stays up for the full on-sale, spike included" target ≥ 99.95% during sale windows',
    );
    expect(text).toContain('nfr fst-lat-read-spike [latency]');
    expect(text).toContain('# Candidate design (canvas graph)');
    expect(text).toContain('node n-1 kind=client');
  });

  it('clips oversized designs with a deterministic marker', () => {
    const many = graph(
      Array.from({ length: 100 }, (_, i) => node(`n-${i}`, 'service', { label: 'x'.repeat(400) })),
    );
    const { text, clipped } = describeDesign(many, flashSaleFacts());
    expect(clipped).toBe(true);
    expect(text.endsWith('[…design clipped for length]')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(GRAPH_TEXT_MAX_CHARS + 40);
  });
});
