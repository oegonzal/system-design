import type { Target, TargetSummary } from '@sysdesign/contracts';

import {
  bootGovconHttp,
  get,
  json,
  resetGovcon,
  send,
  truncateGovcon,
  type Envelope,
  type GovconHttp,
  type Issues,
  type Page,
} from '../app/testing';

describe('the target routes', () => {
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

  const AWARD = '/targets/award/CONT_AWD_W912DY23F0468_9700_W912DY20D0079_9700';
  const put = (path: string, body: unknown) => send(url, 'PUT', path, body);

  it('[GOV-8] [GOV-31] tracks an award and a firm by what they are about, answers whether each is tracked, lists and counts them, and removes one — a firm’s UEI read in capitals', async () => {
    expect((await get<Envelope<Target | null>>(url, AWARD)).data).toBeNull();

    const saved = await put(AWARD, { label: ' W912DY23F0468 ', stage: 'watching' });
    expect(saved.status).toBe(200);
    const award = (await json<Envelope<Target>>(saved)).data;
    expect(award).toMatchObject({
      kind: 'award',
      subject: 'CONT_AWD_W912DY23F0468_9700_W912DY20D0079_9700',
      label: 'W912DY23F0468',
      stage: 'watching',
      notes: '',
      contact: '',
      reminderAt: null,
      endsAt: null,
    });
    expect((await get<Envelope<Target | null>>(url, AWARD)).data).toEqual(award);

    const firm = await put('/targets/firm/jcbmlgpe6z71', {
      label: 'BOOZ ALLEN HAMILTON INC',
      stage: 'contacted',
      contact: 'teaming@example.com',
      reminderAt: '2026-09-28T15:00:00.000Z',
    });
    expect((await json<Envelope<Target>>(firm)).data).toMatchObject({
      kind: 'firm',
      subject: 'JCBMLGPE6Z71',
      contact: 'teaming@example.com',
    });
    // The same row, however the UEI was typed.
    expect(
      (await get<Envelope<Target | null>>(url, '/targets/firm/JCBMLGPE6Z71')).data?.stage,
    ).toBe('contacted');

    const listed = await get<Page<Target>>(url, '/targets');
    expect(listed.meta.total).toBe(2);
    expect(
      (await get<Page<Target>>(url, '/targets?kind=firm')).data.map((row) => row.label),
    ).toEqual(['BOOZ ALLEN HAMILTON INC']);
    expect((await get<Page<Target>>(url, '/targets?stage=watching')).meta.total).toBe(1);
    // The reminder is two days out from the harness's clock: inside the week that makes it due.
    expect((await get<Envelope<TargetSummary>>(url, '/targets/summary')).data).toMatchObject({
      total: 2,
      dueSoon: 1,
      byKind: { firm: { contacted: 1, identified: 0 }, award: { watching: 1 } },
    });

    expect((await send(url, 'DELETE', AWARD)).status).toBe(204);
    expect((await send(url, 'DELETE', AWARD)).status).toBe(404);
    expect((await get<Page<Target>>(url, '/targets')).meta.total).toBe(1);
  });

  it('[GOV-31] refuses a kind it does not have, a subject that is not one of its kind, a stage of the other kind, a label that is empty or too long and a field it does not know — writing nothing', async () => {
    const body = { label: 'Something', stage: 'watching' };
    expect((await put('/targets/grant/ABC', body)).status).toBe(400);
    const badUei = await put('/targets/firm/NOT-A-UEI', { ...body, stage: 'contacted' });
    expect(badUei.status).toBe(400);
    expect((await json<Issues>(badUei)).issues).toEqual([
      { path: 'subject', message: 'a UEI is twelve letters and digits' },
    ]);
    expect((await put('/targets/award/has%20space', body)).status).toBe(400);

    const wrongStage = await put('/targets/firm/JCBMLGPE6Z71', body);
    expect(wrongStage.status).toBe(400);
    expect((await json<{ message: string }>(wrongStage)).message).toBe(
      'watching is not a stage of a firm: identified, contacted, talking, teamed, passed',
    );
    for (const refused of [
      { ...body, label: '   ' },
      { ...body, label: 'a'.repeat(201) },
      { ...body, stage: 'won' },
      { ...body, contact: 'a'.repeat(301) },
      { ...body, reminderAt: 'tomorrow' },
      { ...body, endsAt: '2027-01-01' },
      { stage: 'watching' },
    ]) {
      expect(
        (await put('/targets/award/CONT_AWD_1', refused)).status,
        JSON.stringify(refused),
      ).toBe(400);
    }
    expect((await fetch(`${url}/targets?kind=grant`)).status).toBe(400);
    expect((await get<Page<Target>>(url, '/targets')).meta.total).toBe(0);
  });
});
