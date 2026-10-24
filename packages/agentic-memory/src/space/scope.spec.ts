import { checkScope, visibleTo } from './scope';

describe('scope', () => {
  it('[AGM-7] requires the partition and only declared keys', () => {
    expect(checkScope({ tenant: 't1', user: 'u1' }, ['tenant', 'user'])).toEqual({
      ok: true,
      partition: 't1',
    });
    expect(checkScope({ user: 'u1' }, ['tenant', 'user'])).toMatchObject({ ok: false });
    expect(checkScope({ tenant: 't1', team: 'a' }, ['tenant', 'user'])).toMatchObject({
      ok: false,
    });
  });

  // Reading within a scope — everything at or below it — is the record store's, held by its contract suite.
  it('[AGM-7] shows a record to a request whose scope contains it', () => {
    const tenant = { tenant: 't1' };
    const user = { tenant: 't1', user: 'u1' };
    expect(visibleTo(tenant, user)).toBe(true);
    expect(visibleTo(user, tenant)).toBe(false);
    expect(visibleTo(user, { tenant: 't1', user: 'u2' })).toBe(false);
  });
});
