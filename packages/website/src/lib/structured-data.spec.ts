import { describe, expect, it } from 'vitest';

import { SITE } from '../data/site';
import { verified } from './fact';
import { organizationGraph, serializeJsonLd, type StructuredData } from './structured-data';

const LOGO = 'https://example.test/logo.png';

/** Made-up facts, so the cases test the graph and not the company's data. */
const FACTS = {
  legalName: verified('Example LLC'),
  email: verified('hello@example.test'),
  founder: { name: verified('Ada Example'), title: verified('Founder') },
  organized: verified('2020-02-29' as const),
  address: verified({
    street: '1 Example Way',
    locality: 'Exampleville',
    region: 'EX',
    regionName: 'Example',
    postalCode: '00000-0000',
    country: 'Exampleland',
    countryCode: 'XL',
  }),
};

describe('structured data', () => {
  it('[SITE-4] states each fact it is given as its value, and the WebSite the Organization publishes', () => {
    const [organization, website] = organizationGraph(FACTS, SITE, LOGO)['@graph'];
    const url = new URL('/', SITE.origin).href;

    expect(organization).toEqual({
      '@type': 'Organization',
      '@id': `${url}#organization`,
      name: 'Example LLC',
      url,
      logo: LOGO,
      email: 'hello@example.test',
      foundingDate: '2020-02-29',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '1 Example Way',
        addressLocality: 'Exampleville',
        addressRegion: 'EX',
        postalCode: '00000-0000',
        addressCountry: 'XL',
      },
      founder: { '@type': 'Person', name: 'Ada Example', jobTitle: 'Founder' },
    });
    expect(website).toEqual({
      '@type': 'WebSite',
      '@id': `${url}#website`,
      name: SITE.name,
      url,
      publisher: { '@id': `${url}#organization` },
    });
  });

  it('[SITE-4] refuses to write a fact itself, wherever it sits in the graph', () => {
    // A node is a Record<string, unknown>, so its type admits a fact: one written
    // without its value, in a spread copy, or set on a built node. Only this guard
    // refuses it; the cast here just appends a node to the readonly list.
    const holding = (node: Record<string, unknown>): StructuredData => {
      const graph = organizationGraph(FACTS, SITE, LOGO);
      (graph['@graph'] as Record<string, unknown>[]).push(node);
      return graph;
    };

    expect(() => serializeJsonLd(holding({ identifier: verified('EXAMPLE00000') }))).toThrow(
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
