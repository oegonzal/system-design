/**
 * Data: is the right store doing the right job, and is truth durable?
 */
import type { EvalRule, RuleFinding } from '../types';
import { formatInt, sortById, uniqueSorted } from './shared';

const mixedOltpAnalytics: EvalRule = {
  id: 'data.mixed-oltp-analytics',
  dimension: 'data',
  check({ facts, index }) {
    if (facts.archetype !== 'realtime-analytics') return [];
    const databases = index.byKind('database');
    if (databases.length !== 1) return [];
    if (index.hasKind('replica') || index.hasKind('search-index')) return [];
    const db = databases[0];
    return [
      {
        ruleId: mixedOltpAnalytics.id,
        dimension: 'data',
        severity: 'medium',
        title: 'Dashboards and OLTP share one store',
        message: `Live dashboards and transactional writes both hit "${db.label}", and analytical scans are exactly the queries that evict the OLTP working set and hold the longest locks. Split the read path — a replica or a purpose-built analytics store — before the heaviest dashboard query becomes everyone's outage.`,
        affectedNodeIds: [db.id],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const noSearchIndex: EvalRule = {
  id: 'data.no-search-index',
  dimension: 'data',
  check({ facts, index }) {
    if (!facts.functionalText.includes('search')) return [];
    if (index.hasKind('search-index')) return [];
    return [
      {
        ruleId: noSearchIndex.id,
        dimension: 'data',
        severity: 'medium',
        title: 'Search requirement with no search index',
        message: `The requirements call for search, but nothing in the design provides an inverted index — so search degrades to LIKE-style scans against the primary store. With ${formatInt(facts.scaleTargets.concurrentUsers)} concurrent users, full-text scans on the transactional database are a latency cliff.`,
        affectedNodeIds: [],
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const cacheAsSourceOfTruth: EvalRule = {
  id: 'data.cache-as-source-of-truth',
  dimension: 'data',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const databases = index.byKind('database');
    for (const cache of sortById(index.byKind('cache'))) {
      const writerEdges = sortById(
        index.inEdges(cache.id).filter((edge) => {
          const kind = index.byId(edge.source)?.kind;
          return kind === 'client' || kind === 'service';
        }),
      );
      if (writerEdges.length === 0) continue;
      const durable = databases.some((db) => index.pathExists(cache.id, db.id));
      if (durable) continue;
      findings.push({
        ruleId: cacheAsSourceOfTruth.id,
        dimension: 'data',
        severity: 'high',
        title: 'Cache with no durable store behind it',
        message: `Writes flow into "${cache.label}" but no database is reachable downstream of it, so the cache is acting as the system of record. Caches evict, restart cold, and drop data by design — anything only they hold is already lost.`,
        affectedNodeIds: uniqueSorted([cache.id, ...writerEdges.map((edge) => edge.source)]),
        affectedEdgeIds: uniqueSorted(writerEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

export const dataRules: EvalRule[] = [mixedOltpAnalytics, noSearchIndex, cacheAsSourceOfTruth];
