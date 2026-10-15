import { formatAddress, formatLocality, type PostalAddress } from '../lib/address';
import { formatNaics, formatPsc, type NaicsCode, type PscCode } from '../lib/codes';
import { type Day, formatDay } from '../lib/dates';
import { type Fact, type PersonFacts, verified } from '../lib/fact';

import { FOUNDER } from './founder';

/**
 * The company facts. Approved copy restates some of them, and no check reads
 * it: the bio in founder.ts restates the legal name, the founder's name and
 * the year the company was organized, and the legal name runs through SITE and
 * the pages' copy. Changing any of those means rewording that copy.
 */
interface Company {
  readonly legalName: Fact<string>;
  readonly entity: Fact<string>;
  /** The day the state filing organized the company. */
  readonly organized: Fact<Day>;
  readonly founder: PersonFacts;
  /**
   * The capability statement's named contact. It is the founder today, but it
   * is its own field, so naming another contact leaves the founder unchanged.
   */
  readonly pointOfContact: PersonFacts;
  readonly email: { readonly general: Fact<string>; readonly contracts: Fact<string> };
  readonly uei: Fact<string>;
  readonly cage: Fact<string>;
  readonly samRegistration: { readonly status: Fact<string>; readonly expires: Fact<Day> };
  /**
   * The size the company represents in SAM.gov, which records it per NAICS
   * code: one statement while every code reads "Small: Yes", to reword if one
   * ever does not.
   */
  readonly size: Fact<string>;
  readonly employees: Fact<string>;
  readonly naics: Fact<readonly NaicsCode[]>;
  readonly psc: Fact<readonly PscCode[]>;
  readonly address: Fact<PostalAddress>;
  /** The address's city and state, as prose names where the company is. */
  readonly location: Fact<string>;
  /** How and by whom the work is delivered, as the capability statement says it. */
  readonly delivery: Fact<string>;
}

const founder: PersonFacts = { name: verified(FOUNDER.name), title: verified(FOUNDER.title) };

const address = verified<PostalAddress>({
  street: '16483 Colt Way',
  locality: 'Moreno Valley',
  region: 'CA',
  regionName: 'California',
  postalCode: '92555-3301',
  country: 'United States',
  countryCode: 'US',
});

/**
 * Every company fact the site states, and only these.
 *
 * The registration details are the SAM.gov entity record's (the owner's
 * record, 2026-10-15), copied verbatim but for the PSC titles' letter case,
 * and the NAICS list leaves out the registration's manufacturing and
 * industrial-design codes (326199, 332710, 541420), which the owner keeps off
 * the site; the organization date is the state filing's. Never fill the NAICS or PSC codes from
 * packages/govcon/src/profiles/enfav.ts: that file is the scope govcon
 * searches, not what Enfav is registered under.
 *
 * Certifications, contract vehicles and contract past performance have no
 * fact at all: Enfav holds none yet.
 */
export const COMPANY: Company = {
  legalName: verified('Enfav LLC'),
  entity: verified('California limited liability company'),
  organized: verified('2025-10-24'),
  founder,
  pointOfContact: founder,
  email: {
    general: verified('contact@enfav.com'),
    contracts: verified('contracts@enfav.com'),
  },
  uei: verified('LM9RPK7F5FF5'),
  cage: verified('25T46'),
  samRegistration: { status: verified('Active'), expires: verified('2027-09-26') },
  size: verified(
    'Small business under every registered NAICS code, as self-represented in SAM.gov (size is NAICS- and affiliate-specific)',
  ),
  employees: verified('1 employee'),
  naics: verified([
    { code: '541511', title: 'Custom Computer Programming Services', primary: true },
    { code: '513210', title: 'Software Publishers' },
    {
      code: '518210',
      title:
        'Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services',
    },
    { code: '541512', title: 'Computer Systems Design Services' },
    { code: '541519', title: 'Other Computer Related Services' },
    {
      code: '541519',
      title: 'Information Technology Value Added Resellers',
      sizeStandardException: true,
    },
  ]),
  psc: verified([
    {
      code: '7A20',
      title: 'IT and Telecom – Application Development Software (Perpetual License Software)',
    },
    {
      code: 'DA01',
      title:
        'IT and Telecom – Business Application/Application Development Support Services (Labor)',
    },
    {
      code: 'DA10',
      title: 'IT and Telecom – Business Application/Application Development Software as a Service',
    },
    {
      code: 'DD01',
      title:
        'IT and Telecom – Service Delivery Support Services: ITSM, Operations Center, Project/PM (Labor)',
    },
    {
      code: 'DH01',
      title: 'IT and Telecom – Platform Support Services: Database, Mainframe, Middleware (Labor)',
    },
    { code: 'DJ01', title: 'IT and Telecom – Security and Compliance Support Services (Labor)' },
    { code: 'R425', title: 'Support – Professional: Engineering/Technical' },
    { code: 'R612', title: 'Support – Administrative: Information Retrieval' },
  ]),
  address,
  location: verified(formatLocality(address.value)),
  delivery: verified('Remote delivery · U.S. citizen principal · Travel available'),
};

/** One row of the capability statement's company data: a term and its values, in reading order. */
export interface CompanyDetail {
  readonly term: string;
  readonly values: readonly Fact<string>[];
}

const { status, expires } = COMPANY.samRegistration;

/** The capability statement's company data, in reading order. */
export const COMPANY_DETAILS: readonly CompanyDetail[] = [
  { term: 'Legal name', values: [COMPANY.legalName] },
  {
    term: 'Entity',
    values: [verified(`${COMPANY.entity.value}, organized ${formatDay(COMPANY.organized.value)}`)],
  },
  { term: 'Unique Entity ID (UEI)', values: [COMPANY.uei] },
  { term: 'CAGE code', values: [COMPANY.cage] },
  {
    term: 'SAM.gov registration',
    values: [verified(`${status.value}; expires ${formatDay(expires.value)}`)],
  },
  { term: 'Business size', values: [COMPANY.size, COMPANY.employees] },
  { term: 'NAICS codes', values: COMPANY.naics.value.map((naics) => verified(formatNaics(naics))) },
  { term: 'PSC codes', values: COMPANY.psc.value.map((psc) => verified(formatPsc(psc))) },
  { term: 'Business address', values: [verified(formatAddress(COMPANY.address.value))] },
];
