import { expect, test } from '@playwright/test';

import { COMPANY, COMPANY_DETAILS, type CompanyDetail } from '../../website/src/data/company';
import { restrictedClaimsIn, restrictedClaimsOn, structuredDataStrings } from './support/claims';
import { builtPages, MISSING } from './support/site';

/** Every page the build produced, plus the 404 page. */
const PAGES = [...builtPages(), MISSING];

const MEDIA = ['screen', 'print'] as const;

/** How a fact reads on the page: its value once confirmed, its marker and label until then. */
const shown = (fact: CompanyDetail['fact']): string =>
  fact.status === 'verified' ? fact.value : `Placeholder — ${fact.label}`;

/** The label of every placeholder among the facts the site declares, however deep it sits. */
const labelsIn = (value: unknown): string[] => {
  if (typeof value !== 'object' || value === null) return [];
  if ('status' in value && value.status === 'placeholder' && 'label' in value) {
    return typeof value.label === 'string' ? [value.label] : [];
  }
  return Object.values(value).flatMap(labelsIn);
};

const PLACEHOLDER_LABELS = [...new Set(labelsIn([COMPANY, COMPANY_DETAILS]))];

for (const path of PAGES) {
  test(`[SITE-4] ${path} claims no credential outside a verified fact, on screen or on paper`, async ({
    page,
  }) => {
    await page.goto(path);

    for (const media of MEDIA) {
      await page.emulateMedia({ media });
      expect(await restrictedClaimsOn(page), media).toEqual([]);
    }
  });

  test(`[SITE-4] the structured data on ${path} states no placeholder`, async ({ page }) => {
    await page.goto(path);
    const strings = await structuredDataStrings(page);

    expect(
      strings.filter((text) => PLACEHOLDER_LABELS.some((label) => text.includes(label))),
    ).toEqual([]);
  });

  test(`[SITE-4] every placeholder on ${path} shows its word on screen, and wherever it prints`, async ({
    page,
  }) => {
    await page.goto(path);
    const markers = page.locator('[data-fact="placeholder"]');

    // The word's own box: text content reads the same whatever is drawn.
    for (const marker of await markers.all()) {
      await expect(marker, 'screen').toBeVisible();
      await expect(marker.getByText('Placeholder', { exact: true }), 'screen').toBeVisible();
    }
    // The header, footer and calls to action never print, so a placeholder there
    // puts nothing on paper; every one that does print carries its word.
    await page.emulateMedia({ media: 'print' });
    for (const marker of await markers.filter({ visible: true }).all()) {
      await expect(marker.getByText('Placeholder', { exact: true }), 'print').toBeVisible();
    }
  });
}

test('[SITE-4] the capability statement states every company detail, in order, as the fact the site declares, on screen and on paper', async ({
  page,
}) => {
  await page.goto('/government/');
  const data = page.locator('#company-data');
  const kinds = await data
    .locator('dd')
    .evaluateAll((values) =>
      values.map((value) =>
        [...value.querySelectorAll('[data-fact]')].map((fact) => fact.getAttribute('data-fact')),
      ),
    );

  expect(kinds).toEqual(COMPANY_DETAILS.map(({ fact }) => [fact.status]));
  // The text each medium draws, in any letter case (text-transform changes what
  // innerText returns); an element that draws nothing reads as its text content,
  // so each term and value must be visible too.
  for (const media of MEDIA) {
    await page.emulateMedia({ media });
    for (const item of await data.locator('dt, dd').all()) {
      await expect(item, media).toBeVisible();
    }
    await expect(data.locator('dt'), media).toHaveText(
      COMPANY_DETAILS.map(({ term }) => term),
      { useInnerText: true, ignoreCase: true },
    );
    await expect(data.locator('dd'), media).toHaveText(
      COMPANY_DETAILS.map(({ fact }) => shown(fact)),
      { useInnerText: true, ignoreCase: true },
    );
  }
});

/**
 * Every place a page names a person. The element marked `data-person` with the
 * person's key in COMPANY holds their facts: name, then title, and no other.
 */
const PEOPLE = [
  { path: '/about/', person: 'founder' },
  { path: '/government/', person: 'pointOfContact' },
] as const;

for (const { path, person } of PEOPLE) {
  test(`[SITE-4] ${path} names the ${person} through their facts`, async ({ page }) => {
    await page.goto(path);
    const { name, title } = COMPANY[person];
    const facts = page.locator(`[data-person="${person}"] [data-fact]`);

    // These two and no other, in order, so no fact that reads alike stands in for either.
    await expect(facts).toHaveText([shown(name), shown(title)]);
    expect(
      await facts.evaluateAll((values) => values.map((value) => value.getAttribute('data-fact'))),
    ).toEqual([name.status, title.status]);
  });
}

test('[SITE-4] the claims check finds a phrase spaced, hyphenated or written as one word, beside a symbol, split by markup (rendered, or apart from the text beside it), across elements or in the JSON-LD, and only whole phrases', async ({
  page,
}) => {
  expect(restrictedClaimsIn('An 8(a)-certified firm')).toEqual(
    expect.arrayContaining(['8(a)', 'certified']),
  );
  expect(restrictedClaimsIn('FedRAMP-authorized hosting')).toContain('FedRAMP');
  expect(restrictedClaimsIn('A Veteran Owned business')).toContain('veteran-owned');
  expect(restrictedClaimsIn('A veteran\u2011owned firm')).toContain('veteran-owned');
  expect(restrictedClaimsIn('a small\u2010business set-aside')).toContain('small business');
  expect(restrictedClaimsIn('a SmallBusiness set-aside')).toContain('small business');
  expect(restrictedClaimsIn('ISO-9001 processes')).toContain('ISO 9001');
  expect(restrictedClaimsIn('ISO27001-aligned controls')).toContain('ISO 27001');
  expect(restrictedClaimsIn('Fed\u00adRAMP authorization')).toContain('FedRAMP');
  expect(restrictedClaimsIn('Our FedRAMP\u2122 hosting')).toContain('FedRAMP');
  expect(restrictedClaimsIn('An 8(a)\u00b9 firm')).toContain('8(a)');
  expect(restrictedClaimsIn('TS/SCI-cleared staff')).toContain('cleared');
  expect(
    restrictedClaimsIn(
      'Teaming with prime contractors and small businesses on public-sector, end-to-end work',
    ),
  ).toEqual([]);
  expect(restrictedClaimsIn('Our team is small — business needs come first')).toEqual([]);

  // Adjacent list items read as separate words, never as "measurementFedRAMP".
  await page.setContent(
    '<ul><li>Retrieval quality measurement</li><li>FedRAMP authorization support</li></ul>',
  );
  expect(await restrictedClaimsOn(page)).toContain('FedRAMP');
  // Only the joined reading finds this: every other reading runs it into "smallbusinessowned".
  await page.setContent('<p><span>small</span><span>business</span><span>owned</span></p>');
  expect(await restrictedClaimsOn(page)).toContain('small business');
  // Only each element's whole text finds this: a closed details renders none of it.
  await page.setContent(
    '<details><summary>Scope</summary><p>We are Fed<b>RAMP</b> ready</p></details>',
  );
  expect(await restrictedClaimsOn(page)).toContain('FedRAMP');
  // Only the rendered text finds this: the item's whole text runs it into "measurementFedRAMP".
  await page.setContent(
    '<ul><li><h3>Retrieval quality measurement</h3>Fed<b>RAMP</b> authorization support</li></ul>',
  );
  expect(await restrictedClaimsOn(page)).toContain('FedRAMP');
  // A JSON-LD value is read, the head's block included, which no body reading sees.
  await page.setContent(
    '<!doctype html><html><head><script type="application/ld+json">{"@graph":[{"award":"SBA 8(a) certified"}]}</script></head><body></body></html>',
  );
  expect(await restrictedClaimsOn(page)).toContain('8(a)');
  // A placeholder's label is copy like any other; only a verified fact may state a credential.
  await page.setContent(
    '<p><span data-fact="placeholder">Placeholder — HUBZone status</span> <span data-fact="verified">CMMC Level 2</span></p>',
  );
  const found = await restrictedClaimsOn(page);
  expect(found).toContain('HUBZone');
  expect(found).not.toContain('CMMC');
});
