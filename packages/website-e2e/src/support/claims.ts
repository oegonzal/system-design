/**
 * Claims the site may only make through a verified company fact — never in copy.
 *
 * The owner's rule for this site is that no certification, set-aside status,
 * clearance, contract vehicle or award is ever invented. A verified fact renders
 * inside an element marked `data-fact`; anything matching these phrases outside
 * one is a claim nobody confirmed. The list is data: extend it, never special-case
 * a page.
 */
const RESTRICTED_CLAIMS: readonly string[] = [
  '8(a)',
  'HUBZone',
  'SDVOSB',
  'VOSB',
  'WOSB',
  'EDWOSB',
  'small disadvantaged',
  'veteran-owned',
  'woman-owned',
  'women-owned',
  'minority-owned',
  'small business',
  'security clearance',
  'cleared',
  'certified',
  'FedRAMP',
  'CMMC',
  'ISO 9001',
  'ISO 27001',
  'CMMI',
  'GSA Schedule',
  'awarded',
  'prime contract',
];

const escaped = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A whole-phrase, case-insensitive matcher: "prime contract" never matches "prime contractors". */
const MATCHERS = RESTRICTED_CLAIMS.map(
  (phrase) => [phrase, new RegExp(`(?<![\\w-])${escaped(phrase)}(?![\\w-])`, 'i')] as const,
);

/** The restricted phrases a text contains. */
export const restrictedClaimsIn = (text: string): string[] =>
  MATCHERS.filter(([, matcher]) => matcher.test(text)).map(([phrase]) => phrase);
