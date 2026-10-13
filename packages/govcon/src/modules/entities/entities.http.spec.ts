import type { Entity, EntityLookup, SourceCall } from '@sysdesign/contracts';

import { tinyProfile } from '../../core/testing';
import {
  bootGovconHttp,
  get,
  json,
  post,
  resetGovcon,
  send,
  truncateGovcon,
  type Envelope,
  type GovconHttp,
  type Issues,
  type Page,
} from '../app/testing';

describe('the entities routes', () => {
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

  it("[GOV-8] [GOV-18] looks registrants up through the gate, reads them from the store, and answers the profile's own", async () => {
    expect((await get<Envelope<Entity | null>>(url, '/entities/own')).data).toBeNull();
    expect((await get<Envelope<Entity | null>>(url, '/entities/ABC123DEF456')).data).toBeNull();
    expect((await fetch(`${url}/entities/short`)).status).toBe(400);
    const bad = await post(url, '/entities/lookup', { ueis: ['nope'] });
    expect(bad.status).toBe(400);
    expect((await json<Issues>(bad)).issues[0]?.path).toBe('ueis.0');

    const looked = await post(url, '/entities/lookup', { ueis: ['ABC123DEF456', 'ZZZ000000001'] });
    expect(looked.status).toBe(200);
    const lookup = (await json<Envelope<EntityLookup>>(looked)).data;
    expect(lookup.entities.map((e) => e.uei)).toEqual(['ABC123DEF456']);
    expect(lookup.unknown).toEqual(['ZZZ000000001']);
    expect(lookup).toMatchObject({ spent: 1, budget: 4 });
    expect((await get<Envelope<Entity | null>>(url, '/entities/ABC123DEF456')).data).toMatchObject({
      legalName: 'PRECISION PARTS CO',
      excluded: false,
    });

    const withUei = tinyProfile({ entityUei: 'ABC123DEF456' });
    expect((await send(url, 'PUT', '/profiles/tiny', withUei)).status).toBe(200);
    expect((await get<Envelope<Entity | null>>(url, '/entities/own?profile=tiny')).data?.uei).toBe(
      'ABC123DEF456',
    );
    expect(
      (await get<Page<SourceCall>>(url, '/source/calls')).data.map((call) => call.operation),
    ).toEqual(['entity']);
  });
});
