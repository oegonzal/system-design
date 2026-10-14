import { type Fact, placeholder, verified } from '../lib/fact';

import { FOUNDER } from './founder';

/**
 * Every company fact the site states, and only these.
 *
 * The registration details exist but are not confirmed here yet, so they render
 * as placeholders until the owner copies them verbatim from the SAM.gov entity
 * record (docs/enfav/website.md, "Pre-launch checklist"). Never fill the NAICS
 * or PSC codes from packages/govcon/src/profiles/enfav.ts: that file is the scope
 * govcon searches, not what Enfav is registered under.
 *
 * Certifications, contract vehicles and contract past performance have no row at
 * all: Enfav holds none yet, and a placeholder would imply one is pending.
 */
export const COMPANY = {
  legalName: verified('Enfav LLC'),
  founded: verified('2026'),
  pointOfContact: verified({ name: FOUNDER.name, title: FOUNDER.title }),
  email: {
    general: verified('contact@enfav.com'),
    contracts: verified('contracts@enfav.com'),
  },
} as const;

/** One row of the capability statement's company data. */
export interface CompanyDetail {
  readonly term: string;
  readonly fact: Fact<string>;
}

/** The capability statement's company data, in reading order. */
export const COMPANY_DETAILS: readonly CompanyDetail[] = [
  { term: 'Legal name', fact: COMPANY.legalName },
  { term: 'Unique Entity ID (UEI)', fact: placeholder('from the SAM.gov entity record') },
  { term: 'CAGE code', fact: placeholder('from the SAM.gov entity record') },
  { term: 'NAICS codes', fact: placeholder('as registered in SAM.gov') },
  { term: 'PSC codes', fact: placeholder('as registered in SAM.gov') },
  { term: 'Business size', fact: placeholder('per SAM.gov size standards, by NAICS') },
  { term: 'SAM.gov registration', fact: placeholder('status and expiration date') },
  { term: 'Business address', fact: placeholder('as registered in SAM.gov') },
  { term: 'Founded', fact: COMPANY.founded },
];
