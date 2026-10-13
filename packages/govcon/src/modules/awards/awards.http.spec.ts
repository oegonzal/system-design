import type {
  Award,
  AwardsSummary,
  FetchAwardsReport,
  NoticeDto,
  SourceCall,
} from '@sysdesign/contracts';

import {
  bootGovconHttp,
  get,
  json,
  post,
  pullTiny,
  resetGovcon,
  truncateGovcon,
  type Envelope,
  type GovconHttp,
  type Issues,
  type Page,
} from '../app/testing';

describe('the awards routes', () => {
  let http: GovconHttp;
  let url: string;

  beforeAll(async () => {
    http = await bootGovconHttp();
    url = http.url;
  });

  beforeEach(() => resetGovcon(http));

  afterAll(async () => {
    await truncateGovcon(http.em);
    await http.app.close();
  });

  const pulled = () => pullTiny(url);

  it('[GOV-8] [GOV-17] fetches awards from both sources through the gate, then lists and summarizes them, and the notice sees its solicitation', async () => {
    const bad = await post(url, '/awards/fetch', {
      from: '2026-06-01',
      to: '2026-01-01',
      sources: ['sam.gov'],
    });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues.map((i) => i.path).sort()).toEqual(['naics', 'to']);

    const fetched = await post(url, '/awards/fetch', {
      naics: ['332710'],
      from: '2026-06-01',
      to: '2026-09-29',
      sources: ['sam.gov', 'usaspending'],
    });
    expect(fetched.status).toBe(200);
    const report = (await json<Envelope<FetchAwardsReport>>(fetched)).data;
    expect(report.slices.map((s) => [s.source, s.outcome, s.inserted])).toEqual([
      ['sam.gov', 'ok', 1],
      ['usaspending', 'ok', 1],
    ]);
    expect(report).toMatchObject({ spent: 1, budget: 4 });
    const calls = await get<Page<SourceCall>>(url, '/source/calls?limit=10');
    expect(calls.data.map((call) => [call.source, call.operation]).sort()).toEqual([
      ['sam.gov', 'awards'],
      ['usaspending', 'spending'],
    ]);

    const list = await get<Page<Award>>(url, '/awards?naics=3327&source=sam.gov');
    expect(list.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    expect(list.data[0]).toMatchObject({ externalId: 'SPE4A726P0123-0', amount: 52000 });
    expect((await get<Page<Award>>(url, '/awards')).meta.total).toBe(2);
    expect((await fetch(`${url}/awards?source=other`)).status).toBe(400);
    const summary = await get<Envelope<AwardsSummary>>(url, '/awards/summary?naics=332710');
    expect(summary.data).toMatchObject({
      count: 2,
      total: 104000,
      bySource: { 'sam.gov': 1, usaspending: 1 },
    });

    await pulled();
    const notice = await get<Envelope<NoticeDto>>(url, '/notices/a');
    expect(notice.data.awards.bySolicitation.map((a) => a.externalId).sort()).toEqual([
      'CONT_1',
      'SPE4A726P0123-0',
    ]);
    expect(notice.data.awards.related.count).toBe(2);
    expect(notice.data.factors.find((f) => f.id === 'history')?.evidence[0]).toBe(
      '2 stored award(s) in naics 332710 in the last 365 day(s)',
    );
  });
});
