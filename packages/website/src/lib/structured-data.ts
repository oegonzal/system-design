import { confirmed, type Fact } from './fact';

/** The facts an Organization is described from. Any of them may still be a placeholder. */
export interface OrganizationFacts {
  readonly legalName: Fact<string>;
  readonly email: Fact<string>;
  readonly founder: Fact<{ readonly name: string; readonly title: string }>;
}

interface SiteIdentity {
  readonly origin: string;
  readonly name: string;
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
): Record<string, unknown> {
  const url = new URL('/', site.origin).href;
  const founder = confirmed(facts.founder);
  return {
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
            : { '@type': 'Person', name: founder.name, jobTitle: founder.title },
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
 * JSON for an inline `<script type="application/ld+json">`: `<` is escaped so
 * no value can close the element early.
 */
export const serializeJsonLd = (data: Record<string, unknown>): string =>
  JSON.stringify(data).replace(/</g, '\\u003c');
