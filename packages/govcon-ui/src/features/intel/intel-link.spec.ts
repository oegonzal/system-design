import { describe, expect, it } from 'vitest';

import { EMPTY_AWARD_FILTERS } from './award-query-form';
import { DEFAULT_INTEL_VIEW, INTEL_ROUTE, intelHref, parseIntelView } from './intel-link';

const params = (query: string) => new URLSearchParams(query);

describe('the intel page’s address', () => {
  it('[GOVU-23] opens on the stored awards with nothing narrowed, writes only what differs in one order, and reads its own address back as the same view', () => {
    expect(parseIntelView(params(''))).toEqual(DEFAULT_INTEL_VIEW);
    expect(intelHref(DEFAULT_INTEL_VIEW)).toBe(INTEL_ROUTE);
    const view = {
      tab: 'awards' as const,
      filters: {
        naics: '5415',
        psc: 'DA01',
        agency: 'Veterans Affairs',
        from: '2025-10-01',
        to: '2026-09-30',
        source: 'usaspending' as const,
      },
      offset: 100,
    };
    const href = intelHref(view);
    expect(href).toBe(
      '/intel?naics=5415&psc=DA01&agency=Veterans+Affairs&from=2025-10-01&to=2026-09-30&source=usaspending&offset=100',
    );
    expect(parseIntelView(new URL(href, 'http://localhost').searchParams)).toEqual(view);
    expect(/\s/.test(href)).toBe(false);
    expect(intelHref({ ...DEFAULT_INTEL_VIEW, tab: 'entities' })).toBe('/intel?tab=entities');
  });

  it('[GOVU-23] takes from an address only what its vocabulary has: a side it knows, a source it reads, a day spelled as one, a page that is not behind the first', () => {
    expect(
      parseIntelView(params('tab=people&source=fpds&from=last+year&to=2026-13&offset=-50')),
    ).toEqual({
      tab: 'awards',
      filters: { ...EMPTY_AWARD_FILTERS, to: '' },
      offset: 0,
    });
    expect(parseIntelView(params('tab=entities&offset=abc'))).toEqual({
      ...DEFAULT_INTEL_VIEW,
      tab: 'entities',
    });
  });
});
