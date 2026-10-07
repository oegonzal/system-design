import { listingObservation } from '@sysdesign/contracts';

import { checkExact, exactCheckOf, unmetNote, urlArrivedAt } from './expectations';

describe('what the engine checks of an action’s promise', () => {
  it('[BRW-1] holds a navigation to the URL it named by path and parameters, so a parameter the site adds on arrival is not a failed step', () => {
    // Measured 2026-10-07: a search page inserted the opened listing's id before
    // the keywords the navigation had named; a prefix test called the step failed.
    const named = 'https://jobs.example.test/search-results/?keywords=software%20engineer';
    expect(
      urlArrivedAt(
        'https://jobs.example.test/search-results/?currentJobId=4473257910&keywords=software%20engineer',
        named,
      ),
    ).toBe(true);
    expect(urlArrivedAt(named, named)).toBe(true);
    expect(
      urlArrivedAt('https://jobs.example.test/search-results?keywords=software%20engineer', named),
    ).toBe(true);
    // Another path, a parameter missing or changed, another origin: not arrived.
    expect(urlArrivedAt('https://jobs.example.test/search-results/?keywords=designer', named)).toBe(
      false,
    );
    expect(urlArrivedAt('https://jobs.example.test/search-results/', named)).toBe(false);
    expect(urlArrivedAt('https://jobs.example.test/login?next=search-results', named)).toBe(false);
    expect(
      urlArrivedAt(
        'https://other.example.test/search-results/?keywords=software%20engineer',
        named,
      ),
    ).toBe(false);
    // Text that is no URL is compared as text.
    expect(urlArrivedAt('about:blank', 'about:blank')).toBe(true);
    expect(urlArrivedAt('not a url at all', 'not a url')).toBe(true);
  });

  it('[BRW-1] derives an exact check from an action’s structured fields alone, and words a miss by what was checked', () => {
    const observation = listingObservation();
    expect(
      exactCheckOf(
        { kind: 'navigate', url: 'https://x.test/a?b=1', reason: 'r', expect: null },
        observation,
      ),
    ).toEqual({
      kind: 'url',
      value: 'https://x.test/a?b=1',
    });
    expect(
      exactCheckOf(
        { kind: 'waitFor', until: 'url', value: '/done', reason: 'r', expect: null },
        observation,
      ),
    ).toEqual({
      kind: 'url-contains',
      value: '/done',
    });
    expect(
      exactCheckOf(
        { kind: 'waitFor', until: 'element', value: 'e2', reason: 'r', expect: null },
        observation,
      ),
    ).toEqual({
      kind: 'element',
      role: 'button',
      name: 'Search',
    });
    expect(
      exactCheckOf({ kind: 'click', ref: 'e2', reason: 'r', expect: null }, observation),
    ).toBeNull();
    expect(checkExact({ kind: 'element', role: 'button', name: 'Search' }, observation)).toBe(true);
    expect(checkExact({ kind: 'element', role: 'button', name: 'Submit' }, observation)).toBe(
      false,
    );
    expect(
      checkExact({ kind: 'url', value: 'https://jobs.example.test/search' }, observation),
    ).toBe(true);
    expect(
      unmetNote({
        action: 'navigate x',
        expect: 'the results',
        check: { kind: 'url', value: 'https://x.test/a' },
      }),
    ).toBe('the next page did not show a URL at https://x.test/a — expected: the results');
  });
});
