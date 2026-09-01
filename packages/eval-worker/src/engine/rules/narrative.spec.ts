import { describe, expect, it } from 'vitest';

import { contextFor, flashSaleFacts, graph, node, ruleById } from '../testing';

const phantomClaims = ruleById('communication.narrative-phantom-claims');
const contradictsConfig = ruleById('communication.narrative-contradicts-config');
const noNumbers = ruleById('communication.narrative-no-numbers');

/** Everything this canvas declares, so the prose has something to deny. */
const configuredCanvas = graph([
  node('n-1', 'gateway', { label: 'Edge gateway', config: { rateLimit: true, authMode: 'jwt' } }),
  node('n-2', 'worker', { label: 'Order worker', config: { idempotent: true } }),
  node('n-3', 'database', {
    label: 'Orders DB',
    config: { consistency: 'strong', backups: true, multiRegion: true },
  }),
]);

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

describe('communication.narrative-contradicts-config', () => {
  it('stays silent without a narrative', () => {
    expect(contradictsConfig.check(contextFor(configuredCanvas, flashSaleFacts()))).toEqual([]);
    expect(contradictsConfig.check(contextFor(configuredCanvas, flashSaleFacts(), ' '))).toEqual(
      [],
    );
  });

  it('[EVAL-12] flags prose that denies a capability the diagram configures, quoting both sides', () => {
    const findings = contradictsConfig.check(
      contextFor(
        configuredCanvas,
        flashSaleFacts(),
        'The Edge gateway does no rate limiting, so scripted buyers walk straight through.',
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].message).toContain('"no rate limiting"');
    expect(findings[0].message).toContain('"Edge gateway"');
    expect(findings[0].affectedNodeIds).toEqual(['n-1']);
  });

  it('[EVAL-12] charges once per contradicted capability, so a wholesale liar pays for the lot', () => {
    const findings = contradictsConfig.check(
      contextFor(
        configuredCanvas,
        flashSaleFacts(),
        'The Edge gateway does no rate limiting and no authentication. The Orders DB is eventually consistent, single-region, and has no backups. The Order worker is not idempotent.',
      ),
    );
    expect(findings.length).toBeGreaterThanOrEqual(5);
    expect(findings.every((finding) => finding.severity === 'high')).toBe(true);
  });

  it('says nothing when the diagram never claimed the capability', () => {
    const bare = graph([node('n-1', 'gateway', { label: 'Edge gateway' })]);
    expect(
      contradictsConfig.check(
        contextFor(bare, flashSaleFacts(), 'The Edge gateway does no rate limiting — by design.'),
      ),
    ).toEqual([]);
  });

  it('does not fire on an honest description of the same canvas', () => {
    expect(
      contradictsConfig.check(
        contextFor(
          configuredCanvas,
          flashSaleFacts(),
          'The Edge gateway rate limits and authenticates every call. The Orders DB is strongly consistent, multi-region and backed up. The Order worker is idempotent, so replays converge.',
        ),
      ),
    ).toEqual([]);
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
