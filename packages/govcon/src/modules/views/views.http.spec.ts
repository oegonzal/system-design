import type { SavedView } from '@sysdesign/contracts';

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
} from '../app/testing';

describe('the saved-view routes', () => {
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

  const save = (profile: string, body: unknown) =>
    send(url, 'PUT', `/profiles/${profile}/views`, body);

  it('[GOV-8] [GOV-28] saves a view by name, replaces the address of a name already kept, lists by name, removes by id, and answers an unknown profile or view 404', async () => {
    const first = await save('tiny', { name: ' Who buys ', href: '/spending?tab=where' });
    expect(first.status).toBe(200);
    const kept = (await json<Envelope<SavedView>>(first)).data;
    expect(kept).toMatchObject({
      profileId: 'tiny',
      name: 'Who buys',
      href: '/spending?tab=where',
    });

    const again = await save('tiny', { name: 'Who buys', href: '/spending?tab=reach&window=fytd' });
    expect((await json<Envelope<SavedView>>(again)).data).toMatchObject({
      id: kept.id,
      href: '/spending?tab=reach&window=fytd',
    });
    await save('tiny', { name: 'Ending soon', href: '/spending?tab=horizon' });
    const listed = await get<Envelope<SavedView[]>>(url, '/profiles/tiny/views');
    expect(listed.data.map((view) => view.name)).toEqual(['Ending soon', 'Who buys']);

    expect((await send(url, 'DELETE', `/views/${kept.id}`)).status).toBe(204);
    expect((await send(url, 'DELETE', `/views/${kept.id}`)).status).toBe(404);
    expect((await get<Envelope<SavedView[]>>(url, '/profiles/tiny/views')).data).toHaveLength(1);

    expect((await fetch(`${url}/profiles/nobody/views`)).status).toBe(404);
    expect((await save('nobody', { name: 'Who buys', href: '/spending' })).status).toBe(404);
  });

  it('[GOV-28] refuses an address that is not a path inside the client — another site’s, a scheme, a second slash, a backslash, a blank — and a name that is empty or too long, writing nothing', async () => {
    for (const href of [
      'https://example.com/spending',
      '//example.com/spending',
      '/\\example.com',
      'spending?tab=where',
      'javascript:alert(1)',
      '/spending?tab= where',
      '',
      `/${'a'.repeat(2000)}`,
    ]) {
      const refused = await save('tiny', { name: 'Elsewhere', href });
      expect(refused.status, href).toBe(400);
      expect((await json<Issues>(refused)).issues.map((issue) => issue.path)).toEqual(['href']);
    }
    expect((await save('tiny', { name: '  ', href: '/spending' })).status).toBe(400);
    expect((await save('tiny', { name: 'a'.repeat(121), href: '/spending' })).status).toBe(400);
    expect((await save('tiny', { name: 'Odd', href: '/spending', pinned: true })).status).toBe(400);
    expect((await get<Envelope<SavedView[]>>(url, '/profiles/tiny/views')).data).toEqual([]);
  });
});
