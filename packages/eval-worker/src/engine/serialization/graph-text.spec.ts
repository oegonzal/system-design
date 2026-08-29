import { describe, expect, it } from 'vitest';

import { flashSaleFacts, graph, node } from '../testing';
import { describeDesign, GRAPH_TEXT_MAX_CHARS } from './graph-text';

describe('describeDesign', () => {
  it('renders every NFR with its id, statement, target and machine spec', () => {
    const { text, clipped } = describeDesign(graph([node('n-1', 'client')]), flashSaleFacts());
    expect(clipped).toBe(false);
    expect(text).toContain(
      'nfr fst-avail-sale-window [availability] "The sale window stays up for the full on-sale, spike included" target ≥ 99.95% during sale windows spec availability_pct >= 99.95%',
    );
    expect(text).toContain('nfr fst-lat-read-spike [latency]');
    expect(text).toContain('spec p99_latency_ms <= 250ms');
    expect(text).toContain('# Candidate design (canvas graph)');
    expect(text).toContain('node n-1 kind=client');
  });

  it('omits the spec suffix when an NFR has no targetSpec, and appends retention when stated', () => {
    const base = flashSaleFacts();
    const facts = flashSaleFacts({
      scaleTargets: {
        ...base.scaleTargets,
        dataRetention: '90 days of orders hot, 2 years archived',
      },
      nfrs: [{ ...base.nfrs[0], targetSpec: null }],
    });
    const { text } = describeDesign(graph([node('n-1', 'client')]), facts);
    expect(text).toContain(
      'target ≥ 99.95% during sale windows\nfunctional requirements:', // no spec suffix, last nfr line
    );
    expect(text).toContain(
      'availability 99.95%, retention 90 days of orders hot, 2 years archived',
    );
  });

  it('appends the design narrative as its own section when one is submitted', () => {
    const canvas = graph([node('n-1', 'client')]);
    const { text } = describeDesign(canvas, flashSaleFacts(), 'The client asks; nobody answers.');
    expect(text).toContain(
      "# Design narrative (the author's own explanation)\nThe client asks; nobody answers.",
    );
    expect(describeDesign(canvas, flashSaleFacts()).text).not.toContain('# Design narrative');
    expect(describeDesign(canvas, flashSaleFacts(), '   ').text).not.toContain(
      '# Design narrative',
    );
  });

  it('clips an oversized narrative at 2000 chars with its own marker', () => {
    const long = 'w'.repeat(2500);
    const { text, clipped } = describeDesign(
      graph([node('n-1', 'client')]),
      flashSaleFacts(),
      long,
    );
    expect(clipped).toBe(false); // the whole document still fits the budget
    expect(text).toContain(`${'w'.repeat(2000)} […narrative clipped]`);
    expect(text).not.toContain('w'.repeat(2001));
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
