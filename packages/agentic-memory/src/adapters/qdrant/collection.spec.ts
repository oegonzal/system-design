import type { VisibilityFilter } from '../../ports';
import { collectionName, filterOf } from './collection';

const NOW = new Date('2026-10-01T00:00:00.000Z');

const request = (overrides: Partial<VisibilityFilter> = {}): VisibilityFilter => ({
  spaceId: 'space-1',
  registers: ['facts', 'episodes'],
  partition: 't1',
  scope: { tenant: 't1' },
  scopeKeys: ['tenant', 'user'],
  now: NOW,
  ...overrides,
});

const unset = (key: string) => ({ is_empty: { key } });
const equal = (key: string, value: string) => ({ key, match: { value } });

/** What every search requires before the scope rule: the space, a register, the partition. */
const IN_PARTITION = [
  equal('spaceId', 'space-1'),
  { key: 'register', match: { any: ['facts', 'episodes'] } },
  equal('partition', 't1'),
];
const UNEXPIRED = {
  should: [unset('expiresAt'), { key: 'expiresAt', range: { gt: NOW.toISOString() } }],
};

describe('the Qdrant visibility filter', () => {
  it('[AGM-7] lets a request that names a key see memories without it and memories with its own value — never a sibling’s', () => {
    expect(filterOf(request({ scope: { tenant: 't1', user: 'u1' } })).must).toEqual([
      ...IN_PARTITION,
      { should: [unset('scope.user'), equal('scope.user', 'u1')] },
      UNEXPIRED,
    ]);
    // A sibling's request names only its own value, so u1's memory matches neither branch.
    expect(filterOf(request({ scope: { tenant: 't1', user: 'u2' } })).must).toContainEqual({
      should: [unset('scope.user'), equal('scope.user', 'u2')],
    });
  });

  it('[AGM-7] keeps every narrower memory from a request that does not name its key', () => {
    expect(filterOf(request()).must).toEqual([...IN_PARTITION, unset('scope.user'), UNEXPIRED]);
  });

  it('[AGM-7] reads the policy’s scope keys, not the request’s', () => {
    // The request leaves `project` out, and a project's memories stay out with it.
    const filter = request({
      scopeKeys: ['tenant', 'project', 'user'],
      scope: { tenant: 't1', user: 'u1' },
    });
    expect(filterOf(filter).must).toEqual([
      ...IN_PARTITION,
      unset('scope.project'),
      { should: [unset('scope.user'), equal('scope.user', 'u1')] },
      UNEXPIRED,
    ]);
  });

  it('[AGM-7] needs nothing beyond the partition when the policy declares no other key', () => {
    expect(filterOf(request({ scopeKeys: ['tenant'] })).must).toEqual([...IN_PARTITION, UNEXPIRED]);
  });

  it('[AGM-7] keeps out what has expired by the request’s now', () => {
    const later = new Date('2026-12-01T00:00:00.000Z');
    expect(filterOf(request({ now: later })).must).toContainEqual({
      should: [unset('expiresAt'), { key: 'expiresAt', range: { gt: later.toISOString() } }],
    });
  });

  it('[AGM-6] narrows by the valid-time range it is given, and by every metadata value asked for', () => {
    const since = new Date('2026-09-01T00:00:00.000Z');
    const until = new Date('2026-09-30T00:00:00.000Z');
    const validFrom = (filter: VisibilityFilter) =>
      filterOf(filter).must.filter(
        (condition) => 'key' in condition && condition.key === 'validFrom',
      );
    expect(validFrom(request())).toEqual([]);
    expect(validFrom(request({ since }))).toEqual([
      { key: 'validFrom', range: { gte: since.toISOString() } },
    ]);
    expect(validFrom(request({ until }))).toEqual([
      { key: 'validFrom', range: { lt: until.toISOString() } },
    ]);
    expect(validFrom(request({ since, until }))).toEqual([
      { key: 'validFrom', range: { gte: since.toISOString(), lt: until.toISOString() } },
    ]);
    expect(filterOf(request({ where: { topic: 'x', channel: 'mail' } })).must).toEqual([
      ...IN_PARTITION,
      unset('scope.user'),
      UNEXPIRED,
      equal('metadata.topic', 'x'),
      equal('metadata.channel', 'mail'),
    ]);
  });
});

describe('the collection name', () => {
  it('[AGM-9] binds the index generation, the model and the width, so a new model or width is a new collection', () => {
    expect(collectionName('text-embedding-3-small', 1536)).toBe(
      'agentic-memory__v1__text-embedding-3-small__1536',
    );
    expect(collectionName('text-embedding-3-small', 512)).not.toBe(
      collectionName('text-embedding-3-small', 1536),
    );
    // Anything a collection name may not hold reads as a hyphen.
    expect(collectionName('org/model:v2.1', 8)).toBe('agentic-memory__v1__org-model-v2-1__8');
  });
});
