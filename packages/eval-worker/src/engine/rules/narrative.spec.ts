import { describe, expect, it } from 'vitest';

import { contextFor, flashSaleFacts, graph, node, ruleById } from '../testing';

const phantomClaims = ruleById('communication.narrative-phantom-claims');
const noNumbers = ruleById('communication.narrative-no-numbers');

const bareCanvas = graph([
  node('n-1', 'client', { label: 'Client' }),
  node('n-2', 'service', { label: 'Order Service' }),
  node('n-3', 'database', { label: 'Orders DB' }),
]);

describe('communication.narrative-phantom-claims', () => {
  it('stays silent without a narrative — calibration unmoved', () => {
    expect(phantomClaims.check(contextFor(bareCanvas, flashSaleFacts()))).toEqual([]);
    expect(phantomClaims.check(contextFor(bareCanvas, flashSaleFacts(), '   '))).toEqual([]);
  });

  it('flags a claimed mechanism the diagram never draws, quoting the term', () => {
    const findings = phantomClaims.check(
      contextFor(bareCanvas, flashSaleFacts(), 'Hot reads are served from the cache.'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].message).toContain('"cache"');
    expect(findings[0].message).toContain('draws no component');
  });

  it('accepts the claim when a satisfying kind is drawn', () => {
    const withCdn = graph([node('n-1', 'cdn', { label: 'Edge CDN' })]);
    const findings = phantomClaims.check(
      contextFor(
        withCdn,
        flashSaleFacts(),
        'The Edge CDN caches static assets — a cache at the edge.',
      ),
    );
    expect(findings).toEqual([]);
  });
});

describe('communication.narrative-no-numbers', () => {
  it('flags a numberless story at four-digit request rates', () => {
    const findings = noNumbers.check(
      contextFor(
        bareCanvas,
        flashSaleFacts(),
        'The Client calls the Order Service which writes to the Orders DB, comfortably at peak.',
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].message).toContain('8,000 req/s');
  });

  it('is satisfied by any digit, and forgives small prompts entirely', () => {
    expect(
      noNumbers.check(
        contextFor(bareCanvas, flashSaleFacts(), 'Fourteen replicas hold p99 under 250ms.'),
      ),
    ).toEqual([]);

    const smallScale = flashSaleFacts({
      scaleTargets: { ...flashSaleFacts().scaleTargets, requestsPerSecond: 200 },
    });
    expect(
      noNumbers.check(contextFor(bareCanvas, smallScale, 'A quiet little system, no math needed.')),
    ).toEqual([]);
  });
});
