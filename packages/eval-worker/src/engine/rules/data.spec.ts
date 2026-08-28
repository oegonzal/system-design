import { describe, expect, it } from 'vitest';

import { analyticsFacts, contextFor, edge, graph, node, ruleById } from '../testing';

describe('data.mixed-oltp-analytics', () => {
  const rule = ruleById('data.mixed-oltp-analytics');
  const oneStore = graph(
    [node('client-1', 'client'), node('svc-1', 'service'), node('db-1', 'database')],
    [edge('e1', 'client-1', 'svc-1'), edge('e2', 'svc-1', 'db-1')],
  );

  it('fires when dashboards and OLTP share the only database', () => {
    const findings = rule.check(contextFor(oneStore, analyticsFacts()));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].affectedNodeIds).toEqual(['db-1']);
  });

  it('stays silent once a replica splits the read path', () => {
    const split = graph(
      [node('db-1', 'database'), node('rep-1', 'replica')],
      [edge('e1', 'db-1', 'rep-1', 'async')],
    );
    expect(rule.check(contextFor(split, analyticsFacts()))).toEqual([]);
  });

  it('stays silent for other archetypes', () => {
    expect(rule.check(contextFor(oneStore))).toEqual([]);
  });
});

describe('data.no-search-index', () => {
  const rule = ruleById('data.no-search-index');
  const searchFacts = analyticsFacts({
    functionalText: 'search past campaigns; render live dashboards',
  });

  it('fires when the requirements mention search and no index exists', () => {
    const findings = rule.check(contextFor(graph([node('db-1', 'database')]), searchFacts));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('stays silent when a search index is present', () => {
    expect(rule.check(contextFor(graph([node('idx-1', 'search-index')]), searchFacts))).toEqual([]);
  });

  it('stays silent when search is not required', () => {
    expect(rule.check(contextFor(graph([node('db-1', 'database')]), analyticsFacts()))).toEqual([]);
  });
});

describe('data.cache-as-source-of-truth', () => {
  const rule = ruleById('data.cache-as-source-of-truth');

  it('fires when writes land in a cache with no database behind it', () => {
    const volatile = graph(
      [node('svc-1', 'service'), node('cache-1', 'cache')],
      [edge('e1', 'svc-1', 'cache-1')],
    );
    const findings = rule.check(contextFor(volatile));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].affectedNodeIds).toEqual(['cache-1', 'svc-1']);
  });

  it('stays silent when a database is reachable downstream of the cache', () => {
    const durable = graph(
      [node('svc-1', 'service'), node('cache-1', 'cache'), node('db-1', 'database')],
      [edge('e1', 'svc-1', 'cache-1'), edge('e2', 'cache-1', 'db-1')],
    );
    expect(rule.check(contextFor(durable))).toEqual([]);
  });

  it('stays silent when nothing write-shaped feeds the cache', () => {
    const readOnly = graph(
      [node('db-1', 'database'), node('cache-1', 'cache')],
      [edge('e1', 'db-1', 'cache-1')],
    );
    expect(rule.check(contextFor(readOnly))).toEqual([]);
  });
});
