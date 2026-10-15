import { describe, expect, it } from 'vitest';

import { ENGAGEMENTS, engagementOf, SERVICES } from './services';

describe('services', () => {
  it('declares each engagement once, and every service names one that is declared', () => {
    const ids = ENGAGEMENTS.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const service of SERVICES) {
      expect(engagementOf(service).id).toBe(service.engagement);
    }
  });

  it('refuses a service naming an engagement nothing declares', () => {
    const [service] = SERVICES;
    if (service === undefined) throw new Error('no services');

    expect(() =>
      engagementOf({ ...service, engagement: 'retainer' as (typeof service)['engagement'] }),
    ).toThrow(/No engagement "retainer"/);
  });
});
