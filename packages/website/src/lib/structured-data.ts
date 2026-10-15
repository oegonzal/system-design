import type { PostalAddress } from './address';
import type { Day } from './dates';
import { type Fact, isFact, type PersonFacts } from './fact';

/** The facts an Organization is described from. */
interface OrganizationFacts {
  readonly legalName: Fact<string>;
  readonly email: Fact<string>;
  readonly founder: PersonFacts;
  readonly organized: Fact<Day>;
  readonly address: Fact<PostalAddress>;
}

interface SiteIdentity {
  readonly origin: string;
  readonly name: string;
}

/**
 * The mark only this module writes on a graph, so a graph written by hand does
 * not type-check and one cast to the type fails to serialize. A spread copy
 * keeps the mark, so it says nothing of what a graph holds.
 */
const GRAPH = Symbol('structured data');

/** A page's schema.org graph, as organizationGraph builds it. */
export interface StructuredData {
  readonly '@context': 'https://schema.org';
  readonly '@graph': readonly Record<string, unknown>[];
  readonly [GRAPH]: true;
}

/**
 * The home page's schema.org graph — an Organization and its WebSite — written
 * from the company's facts, each as its value.
 */
export function organizationGraph(
  facts: OrganizationFacts,
  site: SiteIdentity,
  logoUrl: string,
): StructuredData {
  const url = new URL('/', site.origin).href;
  const address = facts.address.value;
  return {
    [GRAPH]: true,
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${url}#organization`,
        name: facts.legalName.value,
        url,
        logo: logoUrl,
        email: facts.email.value,
        foundingDate: facts.organized.value,
        address: {
          '@type': 'PostalAddress',
          streetAddress: address.street,
          addressLocality: address.locality,
          addressRegion: address.region,
          postalCode: address.postalCode,
          addressCountry: address.countryCode,
        },
        founder: {
          '@type': 'Person',
          name: facts.founder.name.value,
          jobTitle: facts.founder.title.value,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${url}#website`,
        name: site.name,
        url,
        publisher: { '@id': `${url}#organization` },
      },
    ],
  };
}

/**
 * JSON for an inline `<script type="application/ld+json">`. The graph must
 * carry organizationGraph's mark, checked here too, so a cast cannot pass off
 * one written by hand; a fact found anywhere in it fails the build, since only
 * a fact's value is data; and `<` is escaped so no value can close the
 * element early. A copy of a built graph keeps the mark, so what a shipped
 * graph holds is checked on the built pages, whose JSON-LD website-e2e reads.
 */
export function serializeJsonLd(data: StructuredData): string {
  if (!(GRAPH in data)) throw new Error('Structured data must be a graph organizationGraph built.');
  return JSON.stringify(data, (key, value: unknown) => {
    if (isFact(value)) {
      throw new Error(`Structured data holds a fact at "${key}": write its value.`);
    }
    return value;
  }).replace(/</g, '\\u003c');
}
