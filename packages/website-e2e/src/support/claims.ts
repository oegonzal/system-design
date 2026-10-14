import type { Page } from '@playwright/test';

/**
 * Claims the site may only make through a verified company fact — never in copy.
 *
 * The owner's rule for this site is that no certification, set-aside status,
 * clearance, contract vehicle or award is ever invented. A verified fact renders
 * inside an element marked `data-fact="verified"`; anything matching these
 * phrases in what restrictedClaimsOn reads — the copy, a placeholder's label,
 * the page's title and metadata, an aria-label, alt or title attribute, or the
 * JSON-LD — is a claim nobody confirmed. The list is data: extend it, never
 * special-case a page.
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

/**
 * Text as the matchers compare it: its compatibility form (NFKC, in which a
 * non-breaking hyphen is U+2010 HYPHEN and a full-width letter is its ASCII
 * one), without the characters that never render, such as a soft hyphen or a
 * zero-width space. A symbol, or a number that is not a plain digit, is set
 * apart first, so the letters and digits NFKC spells it with (™ is TM, ² is 2)
 * never join the word beside it.
 */
const comparable = (text: string): string =>
  text
    .replace(/[\p{S}\p{No}\p{Nl}]/gu, ' $& ')
    .normalize('NFKC')
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '');

/** What may stand between a phrase's words: spaces, a hyphen (U+002D or U+2010), or nothing. */
const SEPARATOR = '[\\s\\-\\u2010]*';

const escaped = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A phrase's words in order: "small business" also finds "small-business" and "SmallBusiness". */
const pattern = (phrase: string): string =>
  comparable(phrase)
    .split(/[\s\-\u2010]+/u)
    .map(escaped)
    .join(SEPARATOR);

/**
 * Whole phrases, case-insensitive. A match never starts or ends inside a word,
 * so "prime contract" does not match "prime contractors", while a hyphen
 * separates words: "8(a)-certified" states both "8(a)" and "certified".
 */
const MATCHERS = RESTRICTED_CLAIMS.map(
  (phrase) => [phrase, new RegExp(`(?<!\\w)${pattern(phrase)}(?!\\w)`, 'iu')] as const,
);

/** The restricted phrases a text contains. */
export const restrictedClaimsIn = (text: string): string[] => {
  const compared = comparable(text);
  return MATCHERS.filter(([, matcher]) => matcher.test(compared)).map(([phrase]) => phrase);
};

/** Every string value in a parsed JSON value: what its reader is told. Keys name schema.org terms. */
const stringsIn = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : typeof value === 'object' && value !== null
      ? Object.values(value).flatMap(stringsIn)
      : [];

/** The string values of every JSON-LD block on a loaded page, the head's included. */
export async function structuredDataStrings(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((block) => stringsIn(JSON.parse(block) as unknown));
}

/**
 * The restricted phrases a loaded page states, outside a verified fact, in what
 * this reads. The body's text is read three ways, and a phrase found in any of
 * them counts: all its text nodes joined with a space, so adjacent items never
 * run into one word; each element's whole text, so a word split by inline
 * markup (`Fed<b>RAMP</b>`) stays whole, rendered or not, wherever that text
 * sets it apart from the text beside it; and the body's innerText in the
 * current medium, so such a word also stays whole beside a block, a line break
 * or a sibling that renders nothing. Read that way, a phrase whose words fall
 * in neighbouring elements is found too, which errs toward a claim. A split
 * word in content the medium does not render (a closed `<details>`, a hidden
 * element) that runs into the text beside it across a block or a line break is
 * whole in no reading, and is not found. The title, every meta content, every
 * aria-label, alt and title attribute, and every string value of every JSON-LD
 * block are read as well; the JSON-LD carries no verified-fact mark, so a
 * phrase there counts even once confirmed. Nothing else is read: not a shadow
 * tree, CSS generated content, a form control's value or placeholder, any other
 * attribute, or a frame's document.
 */
export async function restrictedClaimsOn(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('[data-fact="verified"]').forEach((fact) => fact.remove());
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      nodes.push(node.nodeValue ?? '');
    }
    const elements = [body, ...body.querySelectorAll('*')].map(
      (element) => element.textContent ?? '',
    );
    const attributes = [...body.querySelectorAll('[aria-label], [alt], [title]')].flatMap(
      (element) => ['aria-label', 'alt', 'title'].map((name) => element.getAttribute(name) ?? ''),
    );
    const metadata = [...document.head.querySelectorAll('meta[content]')].map(
      (meta) => meta.getAttribute('content') ?? '',
    );
    // Only the live page renders: each verified fact steps out for the read and back in.
    const restore = [...document.querySelectorAll('[data-fact="verified"]')].map((fact) => {
      const mark = document.createComment('');
      fact.replaceWith(mark);
      return () => mark.replaceWith(fact);
    });
    const rendered = document.body.innerText;
    restore.forEach((put) => put());
    return [nodes.join(' '), ...elements, rendered, document.title, ...attributes, ...metadata];
  });
  const structured = await structuredDataStrings(page);
  return [...new Set([...texts, ...structured].flatMap(restrictedClaimsIn))];
}
