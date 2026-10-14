import { confirmed, type Fact, isFact, type PersonFacts } from './fact';

/** The facts an Organization is described from. Any of them may still be a placeholder. */
interface OrganizationFacts {
  readonly legalName: Fact<string>;
  readonly email: Fact<string>;
  readonly founder: PersonFacts;
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

/** An object with its undefined members dropped, so an unconfirmed fact leaves no key behind. */
const defined = (entries: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));

/**
 * The home page's schema.org graph — an Organization and its WebSite — built
 * from confirmed facts only. A placeholder contributes nothing: structured data
 * is read by machines that cannot see the "Placeholder" marker a person sees.
 */
export function organizationGraph(
  facts: OrganizationFacts,
  site: SiteIdentity,
  logoUrl: string,
): StructuredData {
  const url = new URL('/', site.origin).href;
  const founder = confirmed(facts.founder.name);
  return {
    [GRAPH]: true,
    '@context': 'https://schema.org',
    '@graph': [
      defined({
        '@type': 'Organization',
        '@id': `${url}#organization`,
        name: confirmed(facts.legalName),
        url,
        logo: logoUrl,
        email: confirmed(facts.email),
        founder:
          founder === undefined
            ? undefined
            : defined({
                '@type': 'Person',
                name: founder,
                jobTitle: confirmed(facts.founder.title),
              }),
      }),
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
 * a confirmed value is data; and `<` is escaped so no value can close the
 * element early. A copy of a built graph keeps the mark.
 */
export function serializeJsonLd(data: StructuredData): string {
  if (!(GRAPH in data)) throw new Error('Structured data must be a graph organizationGraph built.');
  return JSON.stringify(data, (key, value: unknown) => {
    if (isFact(value)) {
      throw new Error(`Structured data holds a fact at "${key}": write its confirmed value.`);
    }
    return value;
  }).replace(/</g, '\\u003c');
}
