/**
 * Performance: latency the user feels, beyond raw capacity.
 */
import type { GraphPatch } from '@sysdesign/contracts';

import type { EvalRule, RuleFinding } from '../types';
import { formatInt, sortById, SuggestedIds, uniqueSorted } from './shared';

const noCdnStatic: EvalRule = {
  id: 'performance.no-cdn-static',
  dimension: 'performance',
  check({ facts, index }) {
    if (index.hasKind('cdn')) return [];
    const objectStores = sortById(index.byKind('object-store'));
    if (facts.archetype !== 'media-streaming-pipeline' && objectStores.length === 0) return [];
    return [
      {
        ruleId: noCdnStatic.id,
        dimension: 'performance',
        severity: 'medium',
        title: 'Static content served without a CDN',
        message: `Static and media bytes are served from origin on every request, so each of ${formatInt(facts.scaleTargets.concurrentUsers)} concurrent users pays a full round trip for content that never changes. A CDN moves those bytes to the edge and takes that traffic off the origin entirely.`,
        affectedNodeIds: objectStores.map((store) => store.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const chattyClient: EvalRule = {
  id: 'performance.chatty-client',
  dimension: 'performance',
  check({ index }) {
    if (index.hasKind('gateway')) return [];
    const findings: RuleFinding[] = [];
    for (const client of sortById(index.clients())) {
      const serviceEdges = index
        .outEdges(client.id)
        .filter((edge) => index.byId(edge.target)?.kind === 'service');
      const serviceIds = uniqueSorted(serviceEdges.map((edge) => edge.target));
      if (serviceIds.length < 3) continue;
      findings.push({
        ruleId: chattyClient.id,
        dimension: 'performance',
        severity: 'low',
        title: 'Chatty client with no gateway',
        message: `"${client.label}" calls ${serviceIds.length} services directly, so every page load pays ${serviceIds.length} round trips and every service must handle auth, CORS, and versioning on its own. A gateway gives clients one front door and one place to aggregate.`,
        affectedNodeIds: uniqueSorted([client.id, ...serviceIds]),
        affectedEdgeIds: uniqueSorted(serviceEdges.map((edge) => edge.id)),
        suggestion: null,
      });
    }
    return findings;
  },
};

const deepSyncChain: EvalRule = {
  id: 'performance.deep-sync-chain',
  dimension: 'performance',
  check({ facts, index }) {
    if (facts.scaleTargets.p99LatencyMs > 300) return [];
    const clients = sortById(index.clients());
    if (clients.length === 0) return [];
    const chain = index.longestChain(
      clients.map((client) => client.id),
      { edgeKinds: ['sync'] },
    );
    if (chain <= 5) return [];
    return [
      {
        ruleId: deepSyncChain.id,
        dimension: 'performance',
        severity: 'medium',
        title: 'Request path too deep for the latency budget',
        message: `The longest synchronous path from a client runs ${chain} hops, and the prompt's p99 budget is ${formatInt(facts.scaleTargets.p99LatencyMs)}ms — every hop spends a slice of it on serialization, queuing and the network before any work happens. Collapse hops on the hot path or move work off it asynchronously; depth is a latency tax paid on every single request.`,
        affectedNodeIds: clients.map((client) => client.id),
        affectedEdgeIds: [],
        suggestion: null,
      },
    ];
  },
};

const originServesMedia: EvalRule = {
  id: 'performance.origin-serves-media',
  dimension: 'performance',
  check({ facts, index }) {
    if (facts.archetype !== 'media-streaming-pipeline') return [];
    const stores = sortById(index.byKind('object-store'));
    const clients = sortById(index.clients());
    const offenders: Array<{ clientId: string; storeId: string }> = [];
    for (const client of clients) {
      for (const store of stores) {
        // A client→store path that never passes a CDN pulls media from origin.
        if (index.pathExists(client.id, store.id, { avoidKinds: ['cdn'] })) {
          offenders.push({ clientId: client.id, storeId: store.id });
        }
      }
    }
    if (offenders.length === 0) return [];

    const first = offenders[0];
    const store = index.byId(first.storeId);
    if (!store) return [];
    const ids = new SuggestedIds(index);
    const cdnId = ids.next('cdn');
    const suggestion: GraphPatch = {
      description: 'Front media delivery with a CDN so origin pays for each byte roughly once.',
      ops: [
        { op: 'add-node', node: { id: cdnId, kind: 'cdn', label: 'CDN' } },
        {
          op: 'add-edge',
          edge: { id: ids.next('edge-cdn'), source: first.clientId, target: cdnId, kind: 'sync' },
        },
      ],
    };
    return [
      {
        ruleId: originServesMedia.id,
        dimension: 'performance',
        severity: 'high',
        title: 'Media bytes stream from origin storage',
        message: `Clients can reach "${store.label}" without a CDN on the path, so ${formatInt(facts.scaleTargets.concurrentUsers)} concurrent viewers pull the same segments from origin storage again and again. Media is the textbook edge workload: a CDN serves the repeat bytes from close to the viewer and shields the store from its own popularity.`,
        affectedNodeIds: uniqueSorted(offenders.flatMap((o) => [o.clientId, o.storeId])),
        affectedEdgeIds: [],
        suggestion,
      },
    ];
  },
};

const replicaUnusedForReads: EvalRule = {
  id: 'performance.replica-unused-for-reads',
  dimension: 'performance',
  check({ index }) {
    const replicas = sortById(index.byKind('replica'));
    if (replicas.length === 0) return [];
    const services = sortById(index.byKind('service'));
    const readsFromReplica = services.some((service) =>
      index.outEdges(service.id).some((edge) => index.byId(edge.target)?.kind === 'replica'),
    );
    if (readsFromReplica) return [];
    // With a cache absorbing the repeat reads, the idle replica is a failover
    // story rather than a read-path problem — only flag when reads genuinely
    // pound the primary.
    const clients = index.clients();
    const databases = index.byKind('database');
    const cacheOnReadPath = index
      .byKind('cache')
      .some(
        (cache) =>
          clients.some((client) => index.pathExists(client.id, cache.id)) &&
          databases.some((db) => index.pathExists(cache.id, db.id)),
      );
    if (cacheOnReadPath) return [];

    const ids = new SuggestedIds(index);
    const reader = services[0];
    const suggestion: GraphPatch | null = reader
      ? {
          description: 'Send reads to the replica so the primary only carries the writes.',
          ops: [
            {
              op: 'add-edge',
              edge: {
                id: ids.next('edge-read-replica'),
                source: reader.id,
                target: replicas[0].id,
                kind: 'sync',
              },
            },
          ],
        }
      : null;
    return [
      {
        ruleId: replicaUnusedForReads.id,
        dimension: 'performance',
        severity: 'medium',
        title: 'Replica exists but serves no reads',
        message: `A replica sits on the canvas, yet no service reads from it and no cache shields the primary — every read still lands on the same box as every write. The replica is already paying replication cost; pointing the read path at it splits the load for free.`,
        affectedNodeIds: replicas.map((replica) => replica.id),
        affectedEdgeIds: [],
        suggestion,
      },
    ];
  },
};

export const performanceRules: EvalRule[] = [
  noCdnStatic,
  chattyClient,
  deepSyncChain,
  originServesMedia,
  replicaUnusedForReads,
];
