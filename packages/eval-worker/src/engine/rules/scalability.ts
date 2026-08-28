/**
 * Scalability: does throughput grow without a single component melting first?
 */
import type { PatchOp } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import { formatInt, readsFraction, sortById, SuggestedIds, uniqueSorted } from './shared';

const noCacheReadHeavy: EvalRule = {
  id: 'scalability.no-cache-read-heavy',
  dimension: 'scalability',
  check({ facts, index }) {
    const fraction = readsFraction(facts.scaleTargets.readWriteRatio);
    if (fraction === null || fraction < 0.8) return [];
    const caches = index.byKind('cache');
    const offenders: Array<{ clientId: string; dbId: string }> = [];
    for (const client of sortById(index.clients())) {
      for (const db of sortById(index.byKind('database'))) {
        if (!index.pathExists(client.id, db.id)) continue;
        const cacheOnPath = caches.some(
          (cache) => index.pathExists(client.id, cache.id) && index.pathExists(cache.id, db.id),
        );
        if (!cacheOnPath) offenders.push({ clientId: client.id, dbId: db.id });
      }
    }
    if (offenders.length === 0) return [];

    const first = offenders[0];
    const db = index.byId(first.dbId);
    if (!db) return [];
    const ids = new SuggestedIds(index);
    // Hang the cache off the service closest to the read path when one exists;
    // otherwise suggest it directly on the client's path.
    const serviceBefore = sortById(index.byKind('service')).find(
      (service) =>
        index.pathExists(first.clientId, service.id) && index.pathExists(service.id, first.dbId),
    );
    const cacheId = ids.next('cache');
    const cacheSourceId = serviceBefore ? serviceBefore.id : first.clientId;
    const ops: PatchOp[] = [
      { op: 'add-node', node: { id: cacheId, kind: 'cache', label: 'Read cache' } },
      {
        op: 'add-edge',
        edge: { id: ids.next('edge-cache'), source: cacheSourceId, target: cacheId, kind: 'sync' },
      },
    ];

    return [
      {
        ruleId: noCacheReadHeavy.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'Read-heavy workload with no cache',
        message: `The workload is ${facts.scaleTargets.readWriteRatio} reads to writes, yet every read travels the full path to "${db.label}" — the hardest component in the graph to scale. At ${formatInt(facts.scaleTargets.requestsPerSecond)} req/s a cache absorbs the repeat reads and protects the p99 ${formatInt(facts.scaleTargets.p99LatencyMs)}ms target.`,
        affectedNodeIds: uniqueSorted(offenders.flatMap((o) => [o.clientId, o.dbId])),
        affectedEdgeIds: [],
        suggestion: {
          description:
            'Put a cache in front of the database so repeated reads stop paying the full storage round trip.',
          ops,
        },
      },
    ];
  },
};

const syncToSlowConsumer: EvalRule = {
  id: 'scalability.sync-to-slow-consumer',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const edge of sortById(index.edges())) {
      if (index.edgeKind(edge) !== 'sync') continue;
      const source = index.byId(edge.source);
      const target = index.byId(edge.target);
      if (source?.kind !== 'service') continue;
      if (target?.kind !== 'worker' && target?.kind !== 'external-api') continue;
      const queueId = ids.next('queue');
      findings.push({
        ruleId: syncToSlowConsumer.id,
        dimension: 'scalability',
        severity: 'high',
        title: 'Synchronous call into a slow consumer',
        message: `"${source.label}" calls "${target.label}" synchronously, chaining its latency and error budget to the slowest dependency downstream. A queue in between lets the caller acknowledge fast while "${target.label}" drains work at its own pace.`,
        affectedNodeIds: uniqueSorted([source.id, target.id]),
        affectedEdgeIds: [edge.id],
        suggestion: {
          description:
            'Buffer this call through a queue so a slow consumer cannot stall the caller.',
          ops: [
            { op: 'add-node', node: { id: queueId, kind: 'queue', label: 'Work queue' } },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-enqueue'),
                source: source.id,
                target: queueId,
                kind: 'async',
              },
            },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-dequeue'),
                source: queueId,
                target: target.id,
                kind: 'async',
              },
            },
            { op: 'remove-edge', edgeId: edge.id },
          ],
        },
      });
    }
    return findings;
  },
};

const sharedDbManyServices: EvalRule = {
  id: 'scalability.shared-db-many-services',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    for (const db of sortById(index.byKind('database'))) {
      const serviceEdges = index
        .inEdges(db.id)
        .filter((edge) => index.byId(edge.source)?.kind === 'service');
      const serviceIds = uniqueSorted(serviceEdges.map((edge) => edge.source));
      if (serviceIds.length < 3) continue;
      findings.push({
        ruleId: sharedDbManyServices.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Many services share one database',
        message: `${serviceIds.length} services write into "${db.label}", making its schema, locks, and capacity shared state that couples all of them. One noisy service can starve the rest, and none of them can evolve its data model independently.`,
        affectedNodeIds: uniqueSorted([...serviceIds, db.id]),
        affectedEdgeIds: uniqueSorted(serviceEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const unboundedFanout: EvalRule = {
  id: 'scalability.unbounded-fanout',
  dimension: 'scalability',
  check({ index }) {
    const findings: RuleFinding[] = [];
    const ids = new SuggestedIds(index);
    for (const node of sortById(index.nodes())) {
      const syncOut = index.outEdges(node.id).filter((edge) => index.edgeKind(edge) === 'sync');
      if (syncOut.length <= 4) continue;
      const streamId = ids.next('event-stream');
      findings.push({
        ruleId: unboundedFanout.id,
        dimension: 'scalability',
        severity: 'medium',
        title: 'Unbounded synchronous fan-out',
        message: `"${node.label}" fans out ${syncOut.length} synchronous calls, so its latency is the sum of its slowest branches and any single failure fails the whole operation. Publishing one event and letting consumers subscribe decouples those paths.`,
        affectedNodeIds: [node.id],
        affectedEdgeIds: uniqueSorted(syncOut.map((edge) => edge.id)),
        suggestion: {
          description:
            'Publish once to an event stream and let each consumer subscribe independently instead of fanning out synchronous calls.',
          ops: [
            { op: 'add-node', node: { id: streamId, kind: 'event-stream', label: 'Event stream' } },
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-publish'),
                source: node.id,
                target: streamId,
                kind: 'async',
              },
            },
          ],
        },
      });
    }
    return findings;
  },
};

export const scalabilityRules: EvalRule[] = [
  noCacheReadHeavy,
  syncToSlowConsumer,
  sharedDbManyServices,
  unboundedFanout,
];
