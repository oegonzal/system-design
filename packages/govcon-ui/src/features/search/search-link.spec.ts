import { describe, expect, it } from 'vitest';

import { DEFAULT_LEAD_FILTERS } from '../leads/lead-filters';
import { DEFAULT_SEARCH_VIEW, parseSearchView, SEARCH_ROUTE, searchHref } from './search-link';

const params = (query: string) => new URLSearchParams(query);

describe('the search page’s address', () => {
  it('[GOVU-23] opens on the store with nothing narrowed, writes only what differs in one order, and reads its own address back as the same view', () => {
    expect(parseSearchView(params(''))).toEqual(DEFAULT_SEARCH_VIEW);
    expect(searchHref(DEFAULT_SEARCH_VIEW)).toBe(SEARCH_ROUTE);

    const view = {
      tab: 'store' as const,
      filters: {
        ...DEFAULT_LEAD_FILTERS,
        minScore: 40,
        tier: 'high' as const,
        naics: '5415',
        setAside: 'SBA',
        noticeTypes: ['Presolicitation', 'Sources Sought'],
        agency: 'Veterans Affairs',
        q: 'cloud migration',
        deadlineWithinDays: 30,
        limit: 50,
      },
      offset: 50,
    };
    const href = searchHref(view);
    // A notice type travels as one value each, in the vocabulary's order, whatever order it was pressed in.
    expect(href).toBe(
      '/search?minScore=40&tier=high&naics=5415&setAside=SBA&type=Presolicitation&type=Sources+Sought&agency=Veterans+Affairs&q=cloud+migration&deadlineWithinDays=30&limit=50&offset=50',
    );
    expect(parseSearchView(new URL(href, 'http://localhost').searchParams)).toEqual(view);
    // No whitespace in it: a saved view keeps an address the service accepts.
    expect(/\s/.test(href)).toBe(false);
    expect(searchHref({ ...DEFAULT_SEARCH_VIEW, tab: 'samgov' })).toBe('/search?tab=samgov');
  });

  it('[GOVU-23] takes from an address only what its vocabulary has, and clamps a number to what the service accepts', () => {
    expect(
      parseSearchView(
        params(
          'tab=elsewhere&tier=gold&setAside=NOPE&type=Sources+Sought&type=Made+Up&minScore=900&limit=0&deadlineWithinDays=-4&offset=-10',
        ),
      ),
    ).toEqual({
      tab: 'store',
      filters: {
        ...DEFAULT_LEAD_FILTERS,
        minScore: 100,
        noticeTypes: ['Sources Sought'],
        deadlineWithinDays: 0,
        limit: 1,
      },
      offset: 0,
    });
    expect(parseSearchView(params('minScore=abc&limit=&offset=x')).filters).toEqual(
      DEFAULT_LEAD_FILTERS,
    );
  });
});
