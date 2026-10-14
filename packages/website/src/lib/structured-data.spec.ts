import { describe, expect, it } from 'vitest';

import { SITE } from '../data/site';
import { placeholder, verified } from './fact';
import { organizationGraph, serializeJsonLd, type StructuredData } from './structured-data';

const LOGO = 'https://example.test/logo.png';

/** The facts most cases start from: all made up, all confirmed. */
const FACTS = {
  legalName: verified('Example LLC'),
  email: verified('hello@example.test'),
  founder: { name: verified('Ada Example'), title: verified('Founder') },
};

describe('structured data', () => {
  it('[SITE-4] leaves no trace of a placeholder: an unconfirmed fact contributes no key', () => {
    const graph = organizationGraph(
      {
        legalName: placeholder('legal name pending'),
        email: placeholder('address pending'),
        founder: { name: placeholder('founder pending'), title: placeholder('title pending') },
      },
      SITE,
      LOGO,
    );

    expect(serializeJsonLd(graph)).not.toContain('pending');
    const [organization] = graph['@graph'];
    expect(organization).not.toHaveProperty('name');
    expect(organization).not.toHaveProperty('email');
    expect(organization).not.toHaveProperty('founder');
  });

  it('[SITE-4] states every confirmed fact, and nothing of one that is not', () => {
    const graph = organizationGraph(
      { ...FACTS, founder: { ...FACTS.founder, title: placeholder('title pending') } },
      SITE,
      LOGO,
    );
    const [organization, website] = graph['@graph'];

    expect(organization).toEqual({
      '@type': 'Organization',
      '@id': `${new URL('/', SITE.origin).href}#organization`,
      name: 'Example LLC',
      url: new URL('/', SITE.origin).href,
      logo: LOGO,
      email: 'hello@example.test',
      founder: { '@type': 'Person', name: 'Ada Example' },
    });
    expect(website).toMatchObject({ '@type': 'WebSite', name: SITE.name });
  });

  it('[SITE-4] refuses to write a fact itself, wherever it sits in the graph', () => {
    // A node is a Record<string, unknown>, so its type admits a fact: one written
    // without confirmed(), in a spread copy, or set on a built node. Only this guard
    // refuses it; the cast here just appends a node to the readonly list.
    const holding = (node: Record<string, unknown>): StructuredData => {
      const graph = organizationGraph(FACTS, SITE, LOGO);
      (graph['@graph'] as Record<string, unknown>[]).push(node);
      return graph;
    };

    expect(() => serializeJsonLd(holding({ identifier: placeholder('from SAM.gov') }))).toThrow(
      /holds a fact at "identifier"/,
    );
    expect(() => serializeJsonLd(holding({ founder: { name: { ...verified('Ada') } } }))).toThrow(
      /holds a fact at "name"/,
    );
  });

  it("[SITE-4] refuses a graph cast to the type without organizationGraph's mark", () => {
    const forged = { '@context': 'https://schema.org', '@graph': [] } as unknown as StructuredData;

    expect(() => serializeJsonLd(forged)).toThrow(/organizationGraph built/);
  });

  it('cannot close its script element early', () => {
    const name = '</script><script>alert(1)</script>';
    const json = serializeJsonLd(
      organizationGraph({ ...FACTS, legalName: verified(name) }, SITE, LOGO),
    );

    expect(json).not.toContain('</script>');
    const [organization] = (JSON.parse(json) as { '@graph': unknown[] })['@graph'];
    expect(organization).toMatchObject({ name });
  });
});
