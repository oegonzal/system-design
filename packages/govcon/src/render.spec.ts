import { leadOf, leadsReportOf, noticeOf, pullReportOf, sliceReportOf } from '@sysdesign/contracts';

import { renderLead, renderLeads, renderPull } from './render';

describe('the CLI renderer', () => {
  it('renders a pull as a table with the shared budget line', () => {
    const text = renderPull(
      pullReportOf({
        slices: [
          sliceReportOf(),
          sliceReportOf({
            query: { ...sliceReportOf().query, naics: '5415' },
            outcome: 'budget-exhausted',
            pages: 0,
            received: 0,
            inserted: 0,
            truncated: true,
            detail: 'budget 1/1 spent',
          }),
        ],
        spent: 1,
        budget: 1,
        stoppedBy: 'budget',
      }),
    );
    expect(text).toContain('pull · profile tiny · posted 2026-09-24..2026-09-26 · source sam.gov');
    expect(text).toMatch(/outcome\s+slice\s+pages/);
    expect(text).toContain('naics=332710');
    expect(text).toContain('truncated · budget 1/1 spent');
    expect(text).toContain(
      '1 of 1 attempts used in the last 24 h · 2 stored · 0 cached · 1 not pulled (stopped: budget)',
    );
    expect(
      renderPull(
        pullReportOf({
          source: { id: 'sam.gov', availability: { enabled: false, reason: 'no-key' } },
        }),
      ),
    ).toContain('(disabled: no-key)');
  });

  it('renders leads ranked with their deadline, set-aside, agency and link, or says there are none', () => {
    const text = renderLeads(
      leadsReportOf({
        leads: [
          leadOf(),
          leadOf({
            opportunity: {
              ...leadOf().opportunity,
              uiLink: null,
              setAsideCode: null,
              agencyPath: null,
            },
          }),
        ],
      }),
    );
    expect(text).toContain(
      'leads · profile tiny · 1 candidate(s), 0 excluded by gate, 1 over the filters, 2 shown from 0',
    );
    expect(text).toContain('89.5');
    expect(text).toContain('2026-10-10');
    expect(text).toContain('DLA AVIATION');
    expect(text).toContain('https://sam.gov/opp/n-1/view');
    expect(text).toContain('open');
    expect(renderLeads(leadsReportOf({ leads: [], capped: true }))).toContain('(capped)');
    expect(renderLeads(leadsReportOf({ leads: [] }))).toContain('(no leads');
  });

  it('renders one notice with its facts, its trace and its description or how to fetch it', () => {
    const without = renderLead(noticeOf());
    expect(without).toContain(
      'notice n-1 · Solicitation · posted 2026-09-20 · deadline 2026-10-10 · active',
    );
    expect(without).toContain('score 89.5 · tier high');
    expect(without).toContain('contact A. Buyer a.buyer@dla.mil');
    expect(without).toMatch(/naics\s+1\.00\s+0\.30\s+30\.0/);
    expect(without).toContain('--description');

    const excluded = renderLead(
      noticeOf({
        excluded: { factor: 'setAside', reason: 'ineligible set-aside HZC' },
        score: 0,
        tier: null,
      }),
    );
    expect(excluded).toContain('EXCLUDED by setAside: ineligible set-aside HZC');

    const described = renderLead(
      noticeOf({
        description: { text: 'Bracket, 400 each', fetchedAt: '2026-09-27T02:57:23.527Z' },
      }),
    );
    expect(described).toContain('description (fetched 2026-09-27)');
    expect(described).toContain('Bracket, 400 each');
  });
});
