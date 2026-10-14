import { describe, expect, it } from 'vitest';

import { COMPANY } from '../data/company';
import { SITE } from '../data/site';
import { confirmed, placeholder } from './fact';
import { organizationGraph, serializeJsonLd } from './structured-data';

const LOGO = 'https://example.test/logo.png';

const nodesOf = (graph: Record<string, unknown>) => graph['@graph'] as Record<string, unknown>[];

describe('structured data', () => {
  it('[SITE-4] leaves no trace of a placeholder: an unconfirmed fact contributes no key', () => {
    const graph = organizationGraph(
      {
        legalName: placeholder('legal name pending'),
        email: placeholder('address pending'),
        founder: placeholder('founder pending'),
      },
      SITE,
      LOGO,
    );

    expect(JSON.stringify(graph)).not.toContain('pending');
    const [organization] = nodesOf(graph);
    expect(organization).not.toHaveProperty('name');
    expect(organization).not.toHaveProperty('email');
    expect(organization).not.toHaveProperty('founder');
  });

  it('[SITE-4] states every confirmed fact', () => {
    const facts = {
      legalName: COMPANY.legalName,
      email: COMPANY.email.general,
      founder: COMPANY.pointOfContact,
    };
    const [organization, website] = nodesOf(organizationGraph(facts, SITE, LOGO));
    const founder = confirmed(facts.founder);

    expect(organization).toMatchObject({
      '@type': 'Organization',
      name: confirmed(facts.legalName),
      url: new URL('/', SITE.origin).href,
      logo: LOGO,
      email: confirmed(facts.email),
      founder: { '@type': 'Person', name: founder?.name, jobTitle: founder?.title },
    });
    expect(website).toMatchObject({ '@type': 'WebSite', name: SITE.name });
  });

  it('cannot close its script element early', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

    expect(json).not.toContain('</script>');
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});
